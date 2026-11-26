#include "transport.hpp"

#include <QAudioDevice>
#include <QAudioFormat>
#include <QMediaDevices>
#include <algorithm>
#include <cmath>

namespace lectura {
Transport::Transport(QObject *parent) : QObject(parent) {}
Transport::~Transport() { release(); }

void Transport::release() {
    if (sink) { sink->reset(); sink.reset(); }
    pcm.close();
    pcm.setData({});
    clock.invalidate();
    draining.invalidate();
}

void Transport::load(std::shared_ptr<const Track> track) {
    release();
    track_ = std::move(track);
    base = 0;
    state_ = track_ ? State::Ready : State::Empty;
    Q_EMIT changed();
}

void Transport::play() {
    if (!track_ || state_ == State::Playing) return;
    if (state_ == State::Finished || base >= track_->duration) base = 0;
    state_ = State::Playing;
    if (!track_->pcm.isEmpty()) {
        auto device = QMediaDevices::defaultAudioOutput();
        QAudioFormat format;
        format.setSampleRate(Track::rate);
        format.setChannelCount(Track::channels);
        format.setSampleFormat(QAudioFormat::Int16);
        if (device.isNull() || !device.isFormatSupported(format)) {
            state_ = State::Paused;
            Q_EMIT changed();
            Q_EMIT audioError("Aucune sortie audio compatible. Vérifie le son du système, ou choisis « Sans son ».");
            return;
        }
        pcm.setData(track_->pcm);
        pcm.open(QIODevice::ReadOnly);
        const qint64 sample = std::llround(base * Track::rate / 1000.);
        pcm.seek(std::min(sample * Track::frameBytes, pcm.size()));
        sink = std::make_unique<QAudioSink>(device, format);
        sink->setBufferSize(Track::rate * Track::frameBytes * 64 / 1000);
        sink->setVolume(muted ? 0.0 : 1.0);
        sink->start(&pcm);
    }
    clock.start();
    Q_EMIT changed();
    poll();
}

void Transport::pause() {
    if (state_ != State::Playing) return;
    base = position();
    release();
    state_ = State::Paused;
    Q_EMIT changed();
}

void Transport::stop() {
    release();
    base = 0;
    state_ = track_ ? State::Ready : State::Empty;
    Q_EMIT changed();
}

void Transport::seek(double ms) {
    if (!track_) return;
    const bool playing = state_ == State::Playing;
    release();
    base = std::clamp(ms, 0., double(track_->duration));
    state_ = base == track_->duration ? State::Finished : State::Paused;
    if (playing && state_ != State::Finished) play();
    else Q_EMIT changed();
}

void Transport::mute(bool yes) {
    muted = yes;
    if (sink) sink->setVolume(yes ? 0.0 : 1.0);
}

double Transport::position() const {
    if (!track_) return 0;
    if (state_ != State::Playing) return base;
    const double elapsed = sink ? sink->processedUSecs() / 1000. : double(clock.elapsed());
    return std::clamp(base + elapsed, 0., double(track_->duration));
}

void Transport::finish() {
    base = track_->duration;
    release();
    state_ = State::Finished;
    Q_EMIT changed();
}

void Transport::poll() {
    if (state_ != State::Playing) return;
    if (sink) {
        const auto status = sink->state();
        if (status == QAudio::StoppedState) {
            pause();
            Q_EMIT audioError("La sortie audio s’est arrêtée. Vérifie le périphérique de lecture et réessaie.");
            return;
        }
        // A backend may round down its clock at EOF; let its last buffer drain.
        if (status == QAudio::IdleState && pcm.atEnd()) {
            if (!draining.isValid()) draining.start();
            if (draining.elapsed() >= 85) { finish(); return; }
        } else draining.invalidate();
    }
    if (position() >= track_->duration) finish();
}
}
