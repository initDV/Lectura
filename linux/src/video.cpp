#include "video.hpp"
#include "transcript.hpp"

#include <QDir>
#include <QElapsedTimer>
#include <QFile>
#include <QFileInfo>
#include <QFontDatabase>
#include <QFontMetrics>
#include <QPainter>
#include <QPainterPath>
#include <QProcess>
#include <QStandardPaths>
#include <QTemporaryDir>
#include <QTextDocument>
#include <QTextOption>
#include <cerrno>
#include <cstdio>
#include <cstring>

namespace lectura {
namespace {
constexpr int fps = 30;
constexpr auto credit = "Voix Piper fr_FR-siwis-medium, corpus SIWIS French Speech Synthesis Database, Université d’Édimbourg, CC BY 4.0.";

void checkCancel(const std::atomic_bool *cancel) {
    if (cancel && cancel->load(std::memory_order_relaxed)) fail("Export vidéo annulé.");
}

class Frames {
public:
    Frames(const QString &assets, const Art &art, const Track &track, const QJsonObject &project, const VideoOptions &option)
        : image(option.format == VideoFormat::Portrait ? QSize(720,1280) : QSize(1280,720), QImage::Format_RGB32),
          canvas(assets), track(track), reduced(option.reduced), name(art.name) {
        if (image.isNull()) fail("Mémoire insuffisante pour exporter la vidéo.");
        canvas.configure(art, track.animation(project));
        if (option.format == VideoFormat::Portrait) {
            stageRect = QRectF(22,84,676,736);
            console = QRectF(22,836,676,390);
        } else {
            stageRect = QRectF(22,84,690,582);
            console = QRectF(730,84,528,582);
        }
        body = console.adjusted(22,61,-22,-20);
        auto mono = QFontDatabase::systemFont(QFontDatabase::FixedFont);
        mono.setPixelSize(23);
        document.setDefaultFont(mono);
        document.setUndoRedoEnabled(false);
        document.setDocumentMargin(0);
        auto textOptions = document.defaultTextOption();
        textOptions.setWrapMode(QTextOption::WrapAtWordBoundaryOrAnywhere);
        document.setDefaultTextOption(textOptions);
        document.setTextWidth(body.width());
        nameFont = QFontDatabase::systemFont(QFontDatabase::GeneralFont);
    }
    QSize size() const { return image.size(); }
    const QImage &render(double ms) {
        canvas.frame(ms, track.level(ms), reduced);
        const int next = visiblePrefix(track.text, canvas.visibleChars());
        if (next < chars) { document.clear(); chars = 0; }
        if (next != chars) {
            QTextCursor cursor(&document); cursor.movePosition(QTextCursor::End);
            appendTranscript(cursor, track.text, chars, next);
            chars = next;
        }
        image.fill(QColor("#101219"));
        QPainter p(&image);
        p.setRenderHints(QPainter::Antialiasing | QPainter::TextAntialiasing | QPainter::SmoothPixmapTransform);
        p.save();
        QPainterPath stageClip;
        stageClip.addRoundedRect(stageRect, 12, 12);
        p.setClipPath(stageClip);
        p.translate(stageRect.topLeft());
        canvas.paint(p, stageRect.size());
        p.restore();
        p.setBrush(QColor("#10151f")); p.setPen(QPen(QColor("#30364d"), 1));
        p.drawRoundedRect(console, 12, 12);
        p.setPen(QPen(QColor("#30364d"), 1));
        p.drawLine(console.topLeft()+QPointF(22,48), console.topRight()+QPointF(-22,48));
        p.setBrush(QColor("#83ddc3")); p.setPen(Qt::NoPen);
        p.drawEllipse(console.topLeft()+QPointF(26,27), 4, 4);
        write(p, "TERMINAL", console.adjusted(40,10,-20,-console.height()+43), "#aeb8ce", 14, Qt::AlignVCenter | Qt::AlignLeft, true);
        if (chars) {
            const double scroll = std::max(0., document.size().height()-body.height());
            p.save(); p.setClipRect(body); p.translate(body.left(), body.top()-scroll);
            document.drawContents(&p, QRectF(0, scroll, body.width(), body.height()));
            p.restore();
        }
        write(p, "Lectura", QRectF(22,19,280,47), "#f7f2ff", 33, Qt::AlignLeft | Qt::AlignVCenter, true);
        const QRectF chip(image.width()-236,24,214,39);
        p.setBrush(QColor("#332448")); p.setPen(QPen(QColor("#513968"), 1)); p.drawRoundedRect(chip, 8, 8);
        write(p, name, chip.adjusted(7,0,-7,0), "#e2d2ff", 17, Qt::AlignCenter, true);
        const QRectF footer(22,image.height()-42,image.width()-44,25);
        write(p, track.siwis ? "Voix Siwis HD · Université d’Édimbourg · CC BY 4.0" : "LECTURA  /  STUDIO DE LECTURE",
            footer, "#a5adc1", 13, Qt::AlignLeft | Qt::AlignVCenter, false);
        const int sec = int(ms)/1000;
        const auto time = QString("%1:%2").arg(sec/60, 2, 10, QLatin1Char('0')).arg(sec%60, 2, 10, QLatin1Char('0'));
        write(p, time, footer, "#83ddc3", 15, Qt::AlignRight | Qt::AlignVCenter, true);
        return image;
    }
private:
    void write(QPainter &p, const QString &value, const QRectF &rect, const char *color, int px, int align, bool bold) {
        auto font = nameFont;
        font.setPixelSize(px); font.setBold(bold);
        p.setFont(font); p.setPen(QColor(color));
        p.drawText(rect, align, QFontMetrics(font).elidedText(value, Qt::ElideRight, int(rect.width())));
    }
    QImage image;
    SceneCanvas canvas;
    const Track &track;
    bool reduced;
    QString name;
    QRectF stageRect, console, body;
    QTextDocument document;
    QFont nameFont;
    int chars = 0;
};

[[noreturn]] void encodeError(QProcess &process) {
    auto detail = QString::fromLocal8Bit(process.readAllStandardError()).simplified().left(500);
    if (detail.isEmpty()) detail = process.errorString();
    fail("Export MP4 impossible : " + detail);
}

void send(QProcess &process, const QImage &image, const std::atomic_bool *cancel) {
    const auto length = image.sizeInBytes();
    if (process.write(reinterpret_cast<const char *>(image.constBits()), length) != length) encodeError(process);
    QElapsedTimer waiting; waiting.start();
    while (process.bytesToWrite() > 0) {
        checkCancel(cancel);
        if (!process.waitForBytesWritten(150)) {
            if (process.state() == QProcess::NotRunning) encodeError(process);
            if (waiting.elapsed() > 45000) fail("L’encodage vidéo ne répond plus.");
        } else waiting.restart();
    }
}
}

void exportMp4(const QString &assets, const Art &art, const Track &track, const QJsonObject &project,
    const QString &destination, const VideoOptions &options, const std::atomic_bool *cancel,
    const std::function<void(int)> &progress) {
    checkCancel(cancel);
    if (track.duration <= 0 || track.duration > Track::maxMs) fail("Durée de la scène non prise en charge.");
    const auto ffmpeg = QStandardPaths::findExecutable("ffmpeg");
    if (ffmpeg.isEmpty()) fail("FFmpeg est introuvable. Installe le paquet ffmpeg.");
    const QFileInfo target(destination);
    // Same filesystem as the selected output: commit at the end without exposing a partial MP4.
    QTemporaryDir work(target.absolutePath() + "/.lectura-video-XXXXXX");
    if (!work.isValid()) fail("Impossible d’écrire dans le dossier de destination.");
    const auto tmp = work.filePath("film.mp4");
    Frames frames(assets, art, track, project, options);
    QStringList args{"-hide_banner", "-nostdin", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "bgr0",
        "-video_size", QString("%1x%2").arg(frames.size().width()).arg(frames.size().height()), "-framerate", QString::number(fps), "-i", "pipe:0"};
    if (!track.pcm.isEmpty()) {
        const auto wav = work.filePath("son.wav");
        saveFile(wav, track.wav());
        args << "-i" << wav << "-map" << "0:v:0" << "-map" << "1:a:0" << "-c:a" << "aac" << "-b:a" << "160k";
    } else args << "-map" << "0:v:0" << "-an";
    args << "-c:v" << "libx264" << "-preset" << "veryfast" << "-crf" << "20" << "-threads" << "2" << "-filter_threads" << "2"
        << "-pix_fmt" << "yuv420p" << "-movflags" << "+faststart";
    if (track.siwis) args << "-metadata" << QString("comment=%1").arg(QString::fromUtf8(credit));
    args << tmp;

    QProcess encoder;
    encoder.setStandardOutputFile(QProcess::nullDevice());
    try {
        encoder.start(ffmpeg, args);
        if (!encoder.waitForStarted(5000)) encodeError(encoder);
        const int total = (track.duration * fps + 999) / 1000;
        for (int i = 0; i < total; ++i) {
            checkCancel(cancel);
            // The final frame completes the transcript; audio and video differ by less than a frame.
            const double ms = i+1 == total ? double(track.duration) : i * 1000. / fps;
            send(encoder, frames.render(ms), cancel);
            if (progress) progress(int(99LL*(i+1)/total));
        }
        encoder.closeWriteChannel();
        QElapsedTimer waiting; waiting.start();
        while (!encoder.waitForFinished(150) && encoder.state() != QProcess::NotRunning) {
            checkCancel(cancel);
            if (waiting.elapsed() > 120000) fail("FFmpeg met trop de temps à terminer le fichier.");
        }
        checkCancel(cancel);
        if (encoder.exitStatus() != QProcess::NormalExit || encoder.exitCode() != 0 || QFileInfo(tmp).size() == 0) encodeError(encoder);
        if (::rename(QFile::encodeName(tmp).constData(), QFile::encodeName(target.absoluteFilePath()).constData()) != 0)
            fail("Impossible d’enregistrer le MP4 : " + QString::fromLocal8Bit(std::strerror(errno)));
        if (progress) progress(100);
    } catch (...) {
        if (encoder.state() != QProcess::NotRunning) { encoder.kill(); encoder.waitForFinished(3500); }
        throw;
    }
}
}
