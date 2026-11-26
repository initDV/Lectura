#pragma once

#include <QByteArray>
#include <QJsonArray>
#include <QJsonObject>
#include <QString>
#include <QVector>
#include <atomic>

namespace lectura {
[[noreturn]] void fail(const QString &message);
QByteArray readFile(const QString &path, qint64 maximum);
void saveFile(const QString &path, const QByteArray &bytes);
QJsonObject newProject(const QString &text = {});
QJsonObject openProject(const QString &path);
void saveProject(const QString &path, const QJsonObject &project);

struct Cue {
    QString text, expression = "auto";
    qsizetype offset = 0;
    int start = 0, end = 0, speechEnd = 0;
    bool spoken = true;
};
QVector<Cue> splitText(const QString &text);

struct Track {
    static constexpr int rate = 48000, channels = 2, frameBytes = 4, maxMs = 300000;
    QString text;
    QVector<Cue> cues;
    QByteArray pcm;
    int duration = 0;
    QVector<float> rms;
    double threshold = .002, crest = .03;
    int audioDuration() const;
    void analyze();
    double level(double ms) const;
    QByteArray wav() const;
    QJsonObject animation(const QJsonObject &project) const;
};

enum class Source { Silent, File, LocalVoice };
struct Request {
    QJsonObject project;
    Source source = Source::Silent;
    QString audioFile;
};
Track prepare(const Request &request, const std::atomic_bool *cancel = nullptr);
}
