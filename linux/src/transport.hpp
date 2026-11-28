#pragma once

#include "model.hpp"
#include <QAudioSink>
#include <QBuffer>
#include <QElapsedTimer>
#include <memory>

namespace lectura {
class Transport final : public QObject {
    Q_OBJECT
public:
    enum class State { Empty, Ready, Playing, Paused, Finished };
    explicit Transport(QObject *parent = nullptr);
    ~Transport() override;
    void load(std::shared_ptr<const Track> track);
    void play();
    void pause();
    void stop();
    void seek(double ms);
    void mute(bool yes);
    void poll();
    double position() const;
    State state() const { return state_; }
    std::shared_ptr<const Track> track() const { return track_; }
Q_SIGNALS:
    void changed();
    void audioError(const QString &message);
private:
    void release();
    void finish();
    std::shared_ptr<const Track> track_;
    QBuffer pcm;
    std::unique_ptr<QAudioSink> sink;
    QElapsedTimer clock;
    QElapsedTimer draining;
    State state_ = State::Empty;
    double base = 0;
    bool muted = false;
};
}
