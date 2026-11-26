#pragma once

#include "stage.hpp"
#include "transport.hpp"
#include <QFutureWatcher>
#include <QMainWindow>
#include <QTimer>

class QAction;
class QCheckBox;
class QCloseEvent;
class QComboBox;
class QLabel;
class QLineEdit;
class QPlainTextEdit;
class QProgressDialog;
class QPushButton;
class QSlider;
class QTextEdit;

namespace lectura {
class Window final : public QMainWindow {
public:
    explicit Window(const QString &assets);
    ~Window() override;
    void openPath(const QString &path);
protected:
    void closeEvent(QCloseEvent *event) override;
private:
    struct Prepared { std::shared_ptr<const Track> track; QString error; };
    struct Exported { bool wrote = false; QString error; };
    void ui(const QString &assets);
    void readProject(QJsonObject data, const QString &path);
    void syncProject();
    void changed(bool invalidates);
    void resetReading();
    void setScene();
    void playPause();
    void begin();
    void prepared();
    void refresh();
    void controls();
    void transcript(const QString &text, int chars);
    void notify(const QString &message, bool error = false);
    void updateTitle();
    bool confirmDiscard();
    bool save(bool as = false);
    void chooseAudio();
    void manageSiwis();
    bool ensureSource();
    Request request() const;
    void exportPng();
    void exportWav();
    void exportVideo();
    void videoProgress();
    void videoFinished();
    Source source() const;
    int characterRow(const QString &id) const;

    const QString assetPath;
    QVector<Art> characters;
    QJsonObject project;
    QString projectPath, audioPath;
    bool dirty = false, loading = false, preparing = false, wasPlaying = false;
    QTimer timer;
    QElapsedTimer idle;
    double lastFrame = -2, lastIdle = -1;
    bool lastReduced = false;
    Transport player;
    QFutureWatcher<Prepared> job;
    std::shared_ptr<std::atomic_bool> cancel;
    QFutureWatcher<Exported> encoder;
    std::shared_ptr<std::atomic_bool> cancelVideo;
    std::shared_ptr<std::atomic_int> percent;
    QProgressDialog *exportDialog = nullptr;
    QString videoPath;

    Stage *stage = nullptr;
    QWidget *content = nullptr;
    QTextEdit *terminal = nullptr;
    QPlainTextEdit *script = nullptr;
    QLineEdit *title = nullptr;
    QComboBox *cast = nullptr, *audio = nullptr, *motion = nullptr;
    QCheckBox *reduced = nullptr, *emotions = nullptr;
    QLabel *receipt = nullptr, *character = nullptr, *phase = nullptr, *timecode = nullptr, *count = nullptr, *message = nullptr;
    QAction *exportMovie = nullptr;
    QPushButton *read = nullptr, *stop = nullptr, *pick = nullptr, *mute = nullptr;
    QSlider *seek = nullptr;
    int visibleChars = 0;
    QString terminalText;
};
}
