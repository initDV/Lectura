#include "siwis.hpp"
#include "script.hpp"

#include <QCoreApplication>
#include <QCryptographicHash>
#include <QDir>
#include <QFileInfo>
#include <QJsonDocument>
#include <QLibrary>
#include <QRegularExpression>
#include <QStandardPaths>
#include <onnxruntime_c_api.h>
#include <algorithm>
#include <cmath>
#include <cstring>
#include <future>
#include <thread>

namespace lectura {
namespace {
const QByteArray modelHash = QByteArray::fromHex("b1d946fd68d0347155fa59bce0a018924abbef3c1561181db45ca463d83963ef");
QByteArray verifiedModel(const QString &file) {
    if (QFileInfo(file).size() != siwisModelBytes) fail("Le fichier doit être le modèle officiel Siwis (63 221 984 octets). Consulte « Installer Siwis… ».");
    auto bytes = readFile(file, siwisModelBytes);
    if (QCryptographicHash::hash(bytes, QCryptographicHash::Sha256) != modelHash)
        fail("Le fichier ne correspond pas au modèle Siwis de Lectura (SHA-256 différent).");
    return bytes;
}
QString runtimeLibrary(const QString &assets) {
    const auto uninstalled = QDir(assets).filePath("native/" LECTURA_ORT_NAME);
    if (QFileInfo::exists(uninstalled)) return uninstalled;
    const QDir bin(QCoreApplication::applicationDirPath());
    return bin.absoluteFilePath("../" LECTURA_LIBDIR "/lectura/" LECTURA_ORT_NAME);
}
void ensureNotCancelled(const std::atomic_bool *flag) {
    if (flag && flag->load(std::memory_order_relaxed)) fail("Préparation annulée.");
}

template<class T> using Handle = std::unique_ptr<T, void (*)(T *)>;

// Run is synchronous; with a cancellation flag, a tiny waiter can interrupt it without sharing the session.
class RunGuard {
public:
    RunGuard(const OrtApi &api, OrtRunOptions *options, const std::atomic_bool *cancel)
        : waiter([&api, options, cancel, done = finished.get_future()]() mutable {
            using namespace std::chrono_literals;
            while (done.wait_for(35ms) == std::future_status::timeout) {
                if (!cancel || !cancel->load(std::memory_order_relaxed)) continue;
                if (auto *err = api.RunOptionsSetTerminate(options)) api.ReleaseStatus(err);
                return;
            }
        }) {}
    ~RunGuard() { finished.set_value(); waiter.join(); }
private:
    std::promise<void> finished;
    std::thread waiter;
};

class Voice {
public:
    Voice(const QString &assets, const QString &modelPath)
        : script(QDir(assets).filePath("siwis.js"), "LecturaSiwis"), library(runtimeLibrary(assets)) {
        const auto model = verifiedModel(modelPath);
        library.setLoadHints(QLibrary::ResolveAllSymbolsHint);
        const auto getBase = reinterpret_cast<decltype(&OrtGetApiBase)>(library.resolve("OrtGetApiBase"));
        if (!getBase) fail("Le moteur natif Siwis est indisponible. Réinstalle le paquet Lectura.");
        api = getBase()->GetApi(ORT_API_VERSION);
        if (!api) fail("Version du moteur Siwis incompatible.");
        env = make<OrtEnv>(api->ReleaseEnv, [&](auto out) { return api->CreateEnv(ORT_LOGGING_LEVEL_WARNING, "Lectura", out); });
        const auto settings = make<OrtSessionOptions>(api->ReleaseSessionOptions, [&](auto out) { return api->CreateSessionOptions(out); });
        check(api->SetIntraOpNumThreads(settings.get(), 2));
        check(api->SetSessionGraphOptimizationLevel(settings.get(), ORT_ENABLE_ALL));
        check(api->AddSessionConfigEntry(settings.get(), "session.intra_op.allow_spinning", "0"));
        session = make<OrtSession>(api->ReleaseSession, [&](auto out) {
            return api->CreateSessionFromArray(env.get(), model.constData(), model.size(), settings.get(), out);
        });
        memory = make<OrtMemoryInfo>(api->ReleaseMemoryInfo, [&](auto out) { return api->CreateCpuMemoryInfo(OrtArenaAllocator, OrtMemTypeDefault, out); });
    }
    qsizetype append(QVector<float> &dst, const QString &text, double speed, double &peak, const std::atomic_bool *cancel) {
        ensureNotCancelled(cancel);
        const auto input = text.toUtf8();
        const auto ids = QJsonDocument::fromJson(script.call("ids", input)).array();
        if (ids.isEmpty()) return 0;
        QVector<int64_t> tokens;
        tokens.reserve(ids.size());
        for (const auto &v : ids) tokens.append(v.toInt());
        int64_t len = tokens.size();
        const int64_t shape[] = {1, len}, one[] = {1}, three[] = {3};
        // Original fr_FR-siwis-medium inference settings (versioned in voice/siwis.onnx.json).
        float scales[] = {.5f, float(1. / speed), .333f};
        const auto a = tensor(tokens.data(), len * sizeof(int64_t), shape, 2, ONNX_TENSOR_ELEMENT_DATA_TYPE_INT64);
        const auto b = tensor(&len, sizeof(len), one, 1, ONNX_TENSOR_ELEMENT_DATA_TYPE_INT64);
        const auto c = tensor(scales, sizeof(scales), three, 1, ONNX_TENSOR_ELEMENT_DATA_TYPE_FLOAT);
        const OrtValue *values[] = {a.get(), b.get(), c.get()};
        const char *names[] = {"input", "input_lengths", "scales"}, *outputName = "output";
        const auto runOptions = make<OrtRunOptions>(api->ReleaseRunOptions, [&](auto out) { return api->CreateRunOptions(out); });
        const auto output = make<OrtValue>(api->ReleaseValue, [&](auto out) {
            if (cancel) {
                RunGuard guard(*api, runOptions.get(), cancel);
                return api->Run(session.get(), runOptions.get(), names, values, 3, &outputName, 1, out);
            }
            return api->Run(session.get(), runOptions.get(), names, values, 3, &outputName, 1, out);
        });
        ensureNotCancelled(cancel);
        const auto info = make<OrtTensorTypeAndShapeInfo>(api->ReleaseTensorTypeAndShapeInfo,
            [&](auto out) { return api->GetTensorTypeAndShape(output.get(), out); });
        size_t count = 0;
        ONNXTensorElementDataType type;
        check(api->GetTensorShapeElementCount(info.get(), &count));
        check(api->GetTensorElementType(info.get(), &type));
        if (type != ONNX_TENSOR_ELEMENT_DATA_TYPE_FLOAT || count == 0 || count > size_t(siwisRate) * 60)
            fail("Une phrase dépasse la capacité de synthèse Siwis.");
        void *samples = nullptr;
        check(api->GetTensorMutableData(output.get(), &samples));
        double localPeak = 0;
        for (size_t i = 0; i < count; ++i) {
            const double sample = static_cast<const float *>(samples)[i];
            if (!std::isfinite(sample)) fail("Siwis a produit des échantillons invalides.");
            localPeak = std::max(localPeak, std::abs(sample));
        }
        peak = std::max(peak, localPeak);
        const auto edited = script.binary("prosody", Script::Bytes{samples, qsizetype(count * sizeof(float))}, input,
            double(siwisRate), speed, localPeak);
        if (edited.isEmpty() || edited.size() % sizeof(float)) fail("Le signal Siwis est incomplet.");
        const auto from = dst.size(), length = qsizetype(edited.size() / sizeof(float));
        dst.resize(from + length);
        std::memcpy(dst.data() + from, edited.constData(), edited.size());
        return length;
    }
private:
    void check(OrtStatus *status) {
        const Handle<OrtStatus> owned(status, api->ReleaseStatus);
        if (owned) fail("Siwis : " + QString::fromUtf8(api->GetErrorMessage(status)).left(350));
    }
    template<class T, class F> Handle<T> make(void (*release)(T *), F create) {
        T *value = nullptr;
        const auto status = create(&value);
        Handle<T> owned(value, release);
        check(status);
        return owned;
    }
    Handle<OrtValue> tensor(void *data, size_t bytes, const int64_t *dims, size_t dimCount, ONNXTensorElementDataType type) {
        return make<OrtValue>(api->ReleaseValue, [&](auto out) {
            return api->CreateTensorWithDataAsOrtValue(memory.get(), data, bytes, dims, dimCount, type, out);
        });
    }
    Script script;
    QLibrary library;  // Destroy the handles before unloading the library.
    const OrtApi *api = nullptr;
    Handle<OrtEnv> env{nullptr, nullptr};
    Handle<OrtSession> session{nullptr, nullptr};
    Handle<OrtMemoryInfo> memory{nullptr, nullptr};
};

int pauseAfter(const Track &track, qsizetype index) {
    if (index + 1 == track.cues.size()) return 150;
    const auto &a = track.cues.at(index), &b = track.cues.at(index + 1);
    const auto end = a.offset + a.text.size();
    if (QStringView(track.text).mid(end, b.offset-end).contains('\n')) return 450;
    static const QRegularExpression punctuation("([.!?…]+)[\\s»”'’\"\\]})]*$");
    const auto marks = punctuation.match(a.text).captured(1);
    if (marks.contains('?')) return 360;
    if (marks.contains(QChar(0x2026)) || marks.contains("...")) return 480;
    if (marks.contains('!')) return 320;
    return marks.contains('.') ? 300 : 220;
}
}

QString siwisModelPath() { return QDir(QStandardPaths::writableLocation(QStandardPaths::AppLocalDataLocation)).filePath("voices/siwis.onnx"); }
bool siwisInstalled() {
    const QFileInfo f(siwisModelPath());
    return f.isFile() && f.isReadable() && f.size() == siwisModelBytes;
}
void installSiwis(const QString &source, const QString &destination) {
    const auto data = verifiedModel(source);
    if (!QDir().mkpath(QFileInfo(destination).absolutePath())) fail("Impossible de créer le dossier de la voix Siwis.");
    saveFile(destination, data);
}

QVector<float> synthesizeSiwis(Track &track, const Request &request, const std::atomic_bool *cancel) {
    const auto voice = request.project.value("audio").toObject().value("voix").toObject();
    const double speed = std::clamp(voice.value("vitesse").toDouble(1), .5, 2.);
    const int cps = std::clamp(request.project.value("terminal").toObject().value("vitesseCps").toInt(28), 5, 120);
    QVector<float> pcm;
    double peak = 0;
    const auto millis = [&] { return int(std::llround(pcm.size()*1000. / siwisRate)); };
    const auto checkLength = [&] {
        if (millis() > Track::maxMs) fail("La durée préparée dépasse cinq minutes.");
    };
    const auto silence = [&](double ms) {
        const auto start = pcm.size();
        pcm.resize(start + std::llround(ms * siwisRate / 1000));
        std::fill(pcm.begin()+start, pcm.end(), 0.f);
        checkLength();
    };
    std::unique_ptr<Voice> engine;
    for (qsizetype at = 0; at < track.cues.size(); ++at) {
        ensureNotCancelled(cancel);
        auto &cue = track.cues[at];
        cue.start = millis();
        if (cue.spoken) {
            if (!engine) engine = std::make_unique<Voice>(request.assets, request.siwisModel);
            // Bound each inference while allowing long paragraphs. Prefer a space over splitting a word.
            for (qsizetype start = 0; start < cue.text.size();) {
                auto end = std::min(start + 360, cue.text.size());
                if (end < cue.text.size()) {
                    const auto split = cue.text.lastIndexOf(' ', end-1);
                    if (split >= start + 180) end = split+1;
                    else if (cue.text.at(end-1).isHighSurrogate()) --end;
                }
                const auto count = engine->append(pcm, cue.text.mid(start, end-start).trimmed(), speed, peak, cancel);
                if (count == 0) silence(150);
                checkLength();
                start = end;
            }
            cue.speechEnd = millis();
        } else {
            cue.speechEnd = cue.start;
            silence(cue.text.size()*1000. / (cps*speed));
        }
        silence(pauseAfter(track, at) / speed);
        cue.end = millis();
    }
    const double gain = peak > .001 ? std::min(4., .9 / peak) : 1.;
    for (auto &sample : pcm) sample = float(sample * gain);
    ensureNotCancelled(cancel);
    return pcm;
}
}
