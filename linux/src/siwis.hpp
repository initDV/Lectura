#pragma once
#include "model.hpp"

namespace lectura {
inline constexpr int siwisRate = 22050;
inline constexpr qint64 siwisModelBytes = 63221984;
inline constexpr char siwisModelUrl[] = "https://initdv.github.io/Lectura/models/siwis.onnx";
QString siwisModelPath();
bool siwisInstalled();
void installSiwis(const QString &source, const QString &destination);
QVector<float> synthesizeSiwis(Track &track, const Request &request, const std::atomic_bool *cancel);
}
