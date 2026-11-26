#pragma once
#include "stage.hpp"
#include <functional>

namespace lectura {
enum class VideoFormat { Landscape, Portrait };
struct VideoOptions {
    VideoFormat format = VideoFormat::Landscape;
    bool reduced = false;
};
// Receives a prepared track so the render, terminal and soundtrack share its timeline.
// Called on a worker; commits to destination only when a valid MP4 was fully encoded.
void exportMp4(const QString &assets, const Art &art, const Track &track, const QJsonObject &project,
    const QString &destination, const VideoOptions &options, const std::atomic_bool *cancel = nullptr,
    const std::function<void(int)> &progress = {});
}
