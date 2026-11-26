#include "model.hpp"
#include "siwis.hpp"

#include <QDataStream>
#include <QDateTime>
#include <QElapsedTimer>
#include <QFile>
#include <QFileInfo>
#include <QJsonDocument>
#include <QProcess>
#include <QRegularExpression>
#include <QSaveFile>
#include <QStandardPaths>
#include <QTemporaryDir>
#include <QUuid>
#include <QtEndian>
#include <algorithm>
#include <cmath>
#include <stdexcept>

namespace lectura {
[[noreturn]] void fail(const QString &message) { throw std::runtime_error(message.toStdString()); }

QByteArray readFile(const QString &path, qint64 maximum) {
    QFile f(path);
    if (!QFileInfo(path).isFile() || !f.open(QIODevice::ReadOnly)) fail("Fichier illisible : " + QFileInfo(path).fileName());
    if (f.size() > maximum) fail("Fichier trop volumineux : " + QFileInfo(path).fileName());
    auto bytes = f.read(maximum + 1);
    if (bytes.size() > maximum || f.error() != QFile::NoError) fail("Lecture du fichier incomplète.");
    return bytes;
}

void saveFile(const QString &path, const QByteArray &bytes) {
    QSaveFile f(path);
    if (!f.open(QIODevice::WriteOnly) || f.write(bytes) != bytes.size() || !f.commit())
        fail("Impossible d’enregistrer « " + QFileInfo(path).fileName() + " ».");
}

QJsonObject newProject(const QString &text) {
    const auto date = QDateTime::currentDateTimeUtc().toString(Qt::ISODateWithMs);
    return {{"version", 1}, {"id", QUuid::createUuid().toString(QUuid::WithoutBraces)}, {"titre", ""},
        {"creeLe", date}, {"modifieLe", date}, {"texte", text}, {"personnageId", "robot_lectura"},
        {"audio", QJsonObject{{"source", "voix"}, {"voix", QJsonObject{{"moteur", "webspeech"}, {"vitesse", 1}, {"hauteur", 1}}}}},
        {"timing", "auto"}, {"segments", QJsonArray{}}, {"terminal", QJsonObject{{"theme", "sombre"}, {"vitesseCps", 28}}},
        {"reglages", QJsonObject{{"mouvements", "normal"}, {"emotions", true}}}};
}

QJsonObject openProject(const QString &path) {
    const auto data = QJsonDocument::fromJson(readFile(path, 2 * 1024 * 1024));
    if (!data.isObject()) fail("Ce fichier n’est pas un projet Lectura lisible.");
    auto project = data.object();
    if (project.value("version").toVariant().toDouble() > 1) fail("Ce projet utilise une version plus récente du format Lectura.");
    if (!project.value("texte").isString()) fail("Le texte du projet est absent.");
    project["texte"] = project.value("texte").toString().replace("\r\n", "\n").replace('\r', '\n');
    if (project.value("texte").toString().size() > 12000) fail("Le texte dépasse 12 000 caractères.");
    if (project.value("id").toString().isEmpty()) project["id"] = QUuid::createUuid().toString(QUuid::WithoutBraces);
    const auto id = project.value("personnageId").toString();
    if (id == "professor_1" || id == "robot") project["personnageId"] = id == "robot" ? "robot_rouge" : "robot_lectura";
    // Preserve unknown fields, character IDs, subtitle timings and audio metadata.
    return project;
}

void saveProject(const QString &path, const QJsonObject &project) {
    saveFile(path, QJsonDocument(project).toJson(QJsonDocument::Indented));
}

QVector<Cue> splitText(const QString &text) {
    static const QRegularExpression separator(QStringLiteral("(?<=[.!?…])\\s+"), QRegularExpression::UseUnicodePropertiesOption);
    QVector<Cue> out;
    const auto add = [&](qsizetype a, qsizetype b, bool spoken) {
        while (a < b && text.at(a).isSpace()) ++a;
        while (b > a && text.at(b - 1).isSpace()) --b;
        if (b > a) out.append({text.mid(a, b-a), "auto", a, 0, 0, 0, spoken});
    };
    qsizetype offset = 0;
    for (const auto &line : text.split('\n')) {
        const bool spoken = !line.startsWith("$ ") && !line.startsWith("# ");
        qsizetype start = 0;
        if (spoken) {
            auto it = separator.globalMatch(line);
            while (it.hasNext()) {
                const auto match = it.next();
                add(offset + start, offset + match.capturedStart(), true);
                start = match.capturedEnd();
            }
        }
        add(offset + start, offset + line.size(), spoken);
        offset += line.size()+1;
    }
    return out;
}

int Track::audioDuration() const { return int(pcm.size() * 1000 / (rate * frameBytes)); }

void Track::analyze() {
    constexpr int step = rate * 16 / 1000;
    const auto frames = pcm.size() / frameBytes;
    double maxRms = 0;
    rms.clear();
    rms.reserve((frames + step - 1) / step);
    for (qsizetype at = 0; at < frames; at += step) {
        const auto n = std::min<qsizetype>(step, frames - at);
        double l = 0, r = 0;
        for (qsizetype i = 0; i < n; ++i) {
            const auto *f = pcm.constData() + (at + i) * frameBytes;
            const double a = qFromLittleEndian<qint16>(f) / 32768.0;
            const double b = qFromLittleEndian<qint16>(f+2) / 32768.0;
            l += a*a; r += b*b;
        }
        const double level = std::sqrt(std::max(l, r) / n);
        rms.append(float(level)); maxRms = std::max(maxRms, level);
    }
    threshold = std::clamp(maxRms * .06, .0018, .018);
    crest = std::max(2 * threshold, maxRms * .37);
}

double Track::level(double ms) const {
    if (ms < 0 || ms >= duration) return 0;
    if (pcm.isEmpty()) return .85;  // Silent rehearsal still shows articulations.
    if (rms.isEmpty() || ms >= audioDuration()) return 0;
    const double u = std::clamp(ms / 16 - .5, 0., double(rms.size()-1));
    const auto i = qsizetype(u);
    const double a = rms.at(i), b = rms.at(std::min(i+1, rms.size()-1));
    const double f = std::clamp((a + (b-a)*(u-i) - threshold) / (crest-threshold), 0., 1.);
    return f*f*(3-2*f);
}

QByteArray Track::wav() const {
    QByteArray result;
    QDataStream out(&result, QIODevice::WriteOnly);
    out.setByteOrder(QDataStream::LittleEndian);
    out.writeRawData("RIFF", 4); out << quint32(36 + pcm.size()); out.writeRawData("WAVEfmt ", 8);
    out << quint32(16) << quint16(1) << quint16(channels) << quint32(rate) << quint32(rate*frameBytes) << quint16(frameBytes) << quint16(16);
    out.writeRawData("data", 4); out << quint32(pcm.size());
    result.append(pcm);
    return result;
}

QJsonObject Track::animation(const QJsonObject &project) const {
    QJsonArray parts;
    for (const auto &s : cues) parts.append(QJsonObject{{"texte",s.text}, {"expression",s.expression},
        {"type", s.spoken ? "parle" : s.text.startsWith("$ ") ? "commande" : "commentaire"},
        {"debutMs",s.start}, {"finMs",s.end}, {"speechEndMs",s.speechEnd}});
    const auto settings = project.value("reglages").toObject();
    const auto move = settings.value("mouvements").toString();
    return {{"text",text}, {"segments",parts}, {"duration",duration}, {"siwis",siwis},
        {"lang", project.value("langue").toString("fr")}, {"gain", move=="calme" ? .6 : move=="vif" ? 1.3 : 1.},
        {"emotions",settings.value("emotions").toBool(true)}};
}

static void checkCancel(const std::atomic_bool *cancel) {
    if (cancel && cancel->load(std::memory_order_relaxed)) fail("Préparation annulée.");
}

static void exec(const QString &program, const QStringList &args, const std::atomic_bool *cancel, const QByteArray &input = {}) {
    checkCancel(cancel);
    const auto exe = QStandardPaths::findExecutable(program);
    if (exe.isEmpty()) fail("Programme introuvable : " + program + ". Consulte l’aide d’installation.");
    QProcess p; p.setStandardOutputFile(QProcess::nullDevice());
    p.start(exe, args);
    if (!p.waitForStarted(5000)) fail("Impossible de lancer " + program + ".");
    if (!input.isEmpty()) p.write(input);
    p.closeWriteChannel();
    QElapsedTimer timer; timer.start();
    while (!p.waitForFinished(80) && p.state() != QProcess::NotRunning) {
        if ((cancel && cancel->load(std::memory_order_relaxed)) || timer.elapsed() >= 60000) {
            p.kill(); p.waitForFinished(3000);
            checkCancel(cancel);
            fail(program + " : délai dépassé.");
        }
    }
    checkCancel(cancel);
    if (p.exitStatus() != QProcess::NormalExit || p.exitCode() != 0)
        fail(program + " : " + QString::fromLocal8Bit(p.readAllStandardError()).simplified().left(360));
}

static QByteArray decode(const QString &path, const QString &out, const std::atomic_bool *cancel) {
    const QFileInfo file(path);
    if (!file.isFile() || !file.isReadable()) fail("Fichier audio indisponible. Importe-le de nouveau.");
    if (file.size() > 150 * 1024 * 1024) fail("Le fichier audio dépasse 150 Mio.");
    exec("ffmpeg", {"-nostdin", "-v", "error", "-y", "-protocol_whitelist", "file,pipe", "-threads", "2", "-i", file.absoluteFilePath(),
        "-vn", "-map", "0:a:0", "-t", QString::number(Track::maxMs/1000+1), "-ac", "2", "-ar", "48000", "-f", "s16le", out}, cancel);
    const auto pcm = readFile(out, qint64(Track::maxMs) * Track::rate * Track::frameBytes / 1000);
    if (pcm.isEmpty() || pcm.size() % Track::frameBytes) fail("Le fichier ne contient pas de piste audio utilisable.");
    return pcm;
}

static int weight(const QString &text) {
    static const QRegularExpression tail(QStringLiteral("[.!?…][\"'»)\\]]*$"));
    return int(text.size()) + (tail.match(text).hasMatch() ? 12 : 0) + 6 * int(text.count(',') + text.count(';') + text.count(':'));
}

static void spread(QVector<Cue> &cues, int ms, bool silence) {
    const bool voice = std::any_of(cues.cbegin(), cues.cend(), [](const Cue &s) { return s.spoken; });
    const auto share = [=](const Cue &s) { return s.spoken || !voice ? weight(s.text) : silence ? int(s.text.size()) : 0; };
    int sum = 0, total = 0, previous = 0;
    for (const auto &s : cues) sum += share(s);
    for (auto &s : cues) {
        total += share(s);
        s.start = previous; s.speechEnd = s.end = previous = int(std::lround(double(ms) * total / std::max(1, sum)));
    }
}

static bool subtitleTimes(Track &track, const QJsonObject &project) {
    if (project.value("timing").toString() != "sous-titres") return false;
    const auto segments = project.value("segments").toArray();
    QVector<Cue> cues;
    qsizetype cursor = 0;
    int after = 0;
    for (const auto &item : segments) {
        const auto seg = item.toObject(); const auto text = seg.value("texte").toString();
        const auto offset = track.text.indexOf(text, cursor);
        const int from = seg.value("debutMs").toInt(-1), to = seg.value("finMs").toInt(-1);
        if (text.isEmpty() || offset < 0 || from < after || to <= from || to > track.duration) return false;
        cues.append({text,seg.value("expression").toString("auto"), offset, from, to, to, !text.startsWith("$ ") && !text.startsWith("# ")});
        cursor = offset + text.size(); after = to;
    }
    if (cues.isEmpty()) return false;
    track.cues = cues;
    return true;
}

Track prepare(const Request &r, const std::atomic_bool *cancel) {
    checkCancel(cancel);
    Track track;
    track.text = r.project.value("texte").toString();
    if (track.text.size() > 12000) fail("La limite est de 12 000 caractères par projet.");
    track.cues = splitText(track.text);
    if (track.cues.isEmpty()) fail("Écris ou colle du texte avant de lancer la scène.");
    if (r.source == Source::Silent) {
        int weights = 0;
        for (const auto &s : track.cues) weights += weight(s.text);
        const int cps = std::clamp(r.project.value("terminal").toObject().value("vitesseCps").toInt(28), 5, 120);
        track.duration = std::clamp(weights * 1000 / cps, 750, Track::maxMs);
        spread(track.cues, track.duration, true);
        return track;
    }
    QTemporaryDir tmp;
    if (!tmp.isValid()) fail("Répertoire audio temporaire indisponible.");
    const QString out = tmp.filePath("decode.pcm");
    if (r.source == Source::File) {
        track.pcm = decode(r.audioFile, out, cancel);
        track.duration = track.audioDuration();
        if (!subtitleTimes(track, r.project)) spread(track.cues, track.duration, false);
    } else {
        if (track.cues.size() > 160) fail("Trop de phrases pour une synthèse. Divise le texte en plusieurs projets.");
        if (r.source == Source::Siwis) {
            const auto mono = synthesizeSiwis(track, r, cancel);
            const auto raw = tmp.filePath("siwis.f32");
            saveFile(raw, QByteArray::fromRawData(reinterpret_cast<const char *>(mono.constData()), mono.size()*qsizetype(sizeof(float))));
            exec("ffmpeg", {"-nostdin", "-v", "error", "-y", "-f", "f32le", "-ar", QString::number(siwisRate), "-ac", "1", "-i", raw,
                "-ac", "2", "-ar", QString::number(Track::rate), "-f", "s16le", out}, cancel);
            track.pcm = readFile(out, qint64(Track::maxMs) * Track::rate * Track::frameBytes / 1000);
            track.duration = track.audioDuration();
            track.cues.last().end = track.duration;
            track.siwis = true;
        } else {
            const auto silence = [&](int ms) {
                track.pcm.append(QByteArray(ms * (Track::rate/1000) * Track::frameBytes, '\0'));
            };
            for (auto &s : track.cues) {
                s.start = track.audioDuration();
                if (s.spoken) {
                    const auto wav = tmp.filePath("voix.wav");
                    QFile::remove(wav);
                    exec("espeak-ng", {"-v", "fr-fr", "-s", "152", "-w", wav, "--stdin"}, cancel, s.text.toUtf8());
                    track.pcm.append(decode(wav, out, cancel));
                    s.speechEnd = track.audioDuration();
                    silence(s.text.endsWith('?') ? 230 : 150);
                } else { s.speechEnd = s.start; silence(std::clamp(int(s.text.size()) * 34, 180, 6000)); }
                s.end = track.audioDuration();
                if (s.end > Track::maxMs) fail("La durée préparée dépasse cinq minutes.");
            }
            track.duration = track.audioDuration();
        }
    }
    if (track.duration <= 0 || track.duration > Track::maxMs) fail("Durée audio non prise en charge (maximum cinq minutes).");
    checkCancel(cancel);
    track.analyze();
    return track;
}
}
