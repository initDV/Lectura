#include "window.hpp"
#include "siwis.hpp"
#include "transcript.hpp"
#include "video.hpp"

#include <QApplication>
#include <QCheckBox>
#include <QCloseEvent>
#include <QComboBox>
#include <QDateTime>
#include <QDesktopServices>
#include <QDir>
#include <QFileDialog>
#include <QFile>
#include <QFileInfo>
#include <QFontDatabase>
#include <QFrame>
#include <QHBoxLayout>
#include <QIcon>
#include <QInputDialog>
#include <QLabel>
#include <QLineEdit>
#include <QMenu>
#include <QMessageBox>
#include <QPlainTextEdit>
#include <QProgressDialog>
#include <QPushButton>
#include <QSettings>
#include <QShortcut>
#include <QSignalBlocker>
#include <QSlider>
#include <QSplitter>
#include <QStandardPaths>
#include <QTextEdit>
#include <QUrl>
#include <QVBoxLayout>
#include <QtConcurrentRun>
#include <algorithm>
#include <cmath>

namespace lectura {
namespace {
const QString example = "Bonjour ! Bienvenue dans Lectura.\n\n# Démonstration locale\n$ lectura --bonjour\n\n"
                        "Approche un peu… Est-ce que tu m’entends ?\nBravo, ta scène est prête !";
constexpr int maxText = 12000;
long seconds(double ms) { return long(std::max(0., ms) / 1000.); }
QString time(double ms) {
    const auto s = seconds(ms);
    return QString("%1:%2").arg(s/60, 2, 10, QLatin1Char('0')).arg(s%60, 2, 10, QLatin1Char('0'));
}
QLabel *label(const QString &text, const char *name = "") {
    auto *out = new QLabel(text); out->setObjectName(QLatin1String(name)); out->setTextFormat(Qt::PlainText); return out;
}
QPushButton *button(const QString &text, const char *name = "") {
    auto *out = new QPushButton(text); out->setObjectName(QLatin1String(name)); out->setCursor(Qt::PointingHandCursor); return out;
}
QFrame *card() { auto *out = new QFrame; out->setProperty("card", true); return out; }
QString documentPath() {
    const auto docs = QStandardPaths::writableLocation(QStandardPaths::DocumentsLocation);
    return docs.isEmpty() || !QDir(docs).exists() ? QDir::homePath() : docs;
}
QString suggestedName(const QJsonObject &p, const QString &ext) {
    auto name = p.value("titre").toString().simplified().left(100);
    name.replace('/', '-').replace('\\', '-');
    return (name.isEmpty() ? QString("Lectura") : name) + ext;
}
QString ensureExtension(QString path, const QString &extension) {
    if (!path.endsWith(extension, Qt::CaseInsensitive)) path.append(extension);
    return path;
}
void about(QWidget *owner) {
    QMessageBox::about(owner, "À propos de Lectura",
        QString("Lectura %1 · Linux\nStudio de lecture natif pour ordinateur.\n\n"
                "Qt Widgets · librsvg · QuickJS-NG\nTout le traitement se fait sur cet ordinateur.\n\n"
                "Code et aide : github.com/initDV/Lectura").arg(QCoreApplication::applicationVersion()));
}
}

Window::Window(const QString &assets) : assetPath(assets), characters(catalogue(QDir(assets).filePath("characters"))) {
    ui(assets);
    readProject(newProject(example), {});
    const QSettings settings;
    restoreGeometry(settings.value("window/geometry").toByteArray());
    connect(&job, &QFutureWatcher<Prepared>::finished, this, &Window::prepared);
    connect(&player, &Transport::changed, this, [this] { controls(); refresh(); });
    connect(&player, &Transport::audioError, this, [this](const QString &error) { notify(error, true); });
    connect(&encoder, &QFutureWatcher<Exported>::finished, this, &Window::videoFinished);
    connect(&timer, &QTimer::timeout, this, [this] { player.poll(); refresh(); videoProgress(); });
    timer.start(40);
}
Window::~Window() {
    if (cancel) cancel->store(true);
    if (cancelVideo) cancelVideo->store(true);
    job.waitForFinished();
    encoder.waitForFinished();
}

void Window::ui(const QString &assets) {
    resize(1180, 790);
    setMinimumSize(824, 640);
    auto *root = new QWidget;
    setCentralWidget(root);
    auto *main = new QVBoxLayout(root);
    main->setContentsMargins(20, 16, 20, 12); main->setSpacing(13);
    auto *header = new QHBoxLayout; header->setSpacing(10);
    auto *mark = new QLabel;
    mark->setPixmap(QIcon(QDir(assets).filePath("lectura.png")).pixmap(42, 42));
    mark->setFixedSize(46, 46); mark->setAlignment(Qt::AlignCenter);
    header->addWidget(mark);
    auto *brand = new QVBoxLayout; brand->setSpacing(0);
    brand->addWidget(label("Lectura", "brand")); brand->addWidget(label("STUDIO DE LECTURE", "eyebrow"));
    header->addLayout(brand); header->addWidget(label("LINUX NATIF", "platform"), 0, Qt::AlignTop); header->addStretch();
    auto *make = button("Nouveau"), *open = button("Ouvrir…"), *write = button("Enregistrer"), *more = button("Plus ▾");
    for (auto *control : {make, open, write, more}) header->addWidget(control);
    main->addLayout(header);

    auto *split = new QSplitter(Qt::Horizontal);
    split->setChildrenCollapsible(false);
    split->setHandleWidth(12);
    auto *left = card(); auto *form = new QVBoxLayout(left);
    left->setMinimumWidth(242); form->setContentsMargins(16, 14, 16, 15); form->setSpacing(7);
    form->addWidget(label("01  /  PROJET", "eyebrow"));
    form->addWidget(label("Ton texte", "heading"));
    title = new QLineEdit; title->setPlaceholderText("Titre du projet"); title->setMaxLength(200); title->setAccessibleName("Titre du projet");
    form->addWidget(title);
    script = new QPlainTextEdit; script->setObjectName("script"); script->setAccessibleName("Texte à lire");
    script->setPlaceholderText("Colle ou écris le texte à lire ici…"); script->setMinimumHeight(83);
    form->addWidget(script, 1);
    auto *hints = new QHBoxLayout;
    hints->addWidget(label("$ commande · # commentaire", "hint")); hints->addStretch();
    count = label("0", "hint"); count->setToolTip("Caractères · maximum 12 000"); hints->addWidget(count);
    form->addLayout(hints); form->addSpacing(6);
    form->addWidget(label("Personnage", "caption"));
    cast = new QComboBox; cast->setObjectName("cast"); cast->setAccessibleName("Personnage"); cast->setIconSize(QSize(24,24));
    for (const auto &art : characters) cast->addItem(QPixmap::fromImage(art.icon), art.name, art.id);
    form->addWidget(cast);
    motion = new QComboBox; motion->setAccessibleName("Amplitude des mouvements");
    motion->addItem("Mouvements normaux", "normal"); motion->addItem("Mouvements calmes", "calme"); motion->addItem("Mouvements vifs", "vif");
    form->addWidget(motion);
    reduced = new QCheckBox("Réduire les animations"); reduced->setChecked(QSettings().value("stage/reduced", false).toBool());
    emotions = new QCheckBox("Émotions automatiques");
    form->addWidget(emotions); form->addWidget(reduced);

    auto *right = card(); auto *show = new QVBoxLayout(right);
    show->setContentsMargins(0, 0, 0, 0); show->setSpacing(0);
    auto *sceneHead = new QHBoxLayout; sceneHead->setContentsMargins(16, 12, 16, 12);
    auto *sceneTitle = new QVBoxLayout; sceneTitle->setSpacing(2);
    sceneTitle->addWidget(label("02  /  SCÈNE", "eyebrow")); sceneTitle->addWidget(label("Aperçu de lecture", "heading"));
    sceneHead->addLayout(sceneTitle); sceneHead->addStretch();
    character = label({}, "chip"); sceneHead->addWidget(character, 0, Qt::AlignVCenter);
    show->addLayout(sceneHead);
    content = new QWidget; content->setObjectName("sceneContent");
    auto *canvas = new QHBoxLayout(content); canvas->setContentsMargins(0, 0, 0, 0); canvas->setSpacing(0);
    stage = new Stage(assets); canvas->addWidget(stage, 6);
    auto *console = new QFrame; console->setObjectName("console"); console->setMinimumWidth(175);
    auto *log = new QVBoxLayout(console);
    log->setContentsMargins(12, 10, 12, 9); log->setSpacing(6);
    auto *bar = new QHBoxLayout;
    bar->addWidget(label("●", "liveDot")); bar->addWidget(label("TERMINAL", "eyebrow")); bar->addStretch();
    bar->addWidget(label("LECTURA / 01", "hint")); log->addLayout(bar);
    terminal = new QTextEdit; terminal->setObjectName("terminal"); terminal->setReadOnly(true); terminal->setAcceptRichText(false);
    terminal->setFont(QFontDatabase::systemFont(QFontDatabase::FixedFont)); terminal->setAccessibleName("Terminal de lecture");
    terminal->setPlaceholderText("Le texte s’affichera ici au rythme de la lecture.");
    log->addWidget(terminal, 1); canvas->addWidget(console, 5);
    show->addWidget(content, 1);

    auto *deck = new QVBoxLayout; deck->setContentsMargins(13, 10, 13, 12); deck->setSpacing(6);
    auto *sourceLine = new QHBoxLayout; sourceLine->setSpacing(7);
    sourceLine->addWidget(label("Son", "caption"));
    audio = new QComboBox; audio->setObjectName("audio"); audio->setAccessibleName("Source sonore");
    audio->addItem("Voix française locale", int(Source::LocalVoice));
    audio->addItem("Siwis HD · hors ligne", int(Source::Siwis));
    audio->addItem("Fichier audio", int(Source::File)); audio->addItem("Sans son", int(Source::Silent));
    sourceLine->addWidget(audio);
    pick = button("Importer un audio…", "importAudio"); sourceLine->addWidget(pick);
    receipt = label({}, "hint"); receipt->setSizePolicy(QSizePolicy::Ignored, QSizePolicy::Preferred);
    sourceLine->addWidget(receipt, 1);
    deck->addLayout(sourceLine);

    auto *seekLine = new QHBoxLayout; seekLine->setSpacing(9);
    seek = new QSlider(Qt::Horizontal); seek->setObjectName("seek"); seek->setAccessibleName("Position de lecture");
    seek->setRange(0, 0); seek->setSingleStep(1000); seek->setPageStep(5000);
    seekLine->addWidget(seek, 1);
    timecode = label("00:00 / 00:00", "timecode"); seekLine->addWidget(timecode);
    deck->addLayout(seekLine);
    auto *controlsLine = new QHBoxLayout; controlsLine->setSpacing(7);
    read = button("▶  Lire", "playPause"); read->setProperty("primary", true); read->setMinimumWidth(108);
    read->setToolTip("Lancer, mettre en pause ou reprendre (Ctrl+Entrée)");
    stop = button("Arrêter", "stop");
    mute = button("Couper le son", "mute"); mute->setCheckable(true);
    controlsLine->addWidget(read); controlsLine->addWidget(stop); controlsLine->addWidget(mute); controlsLine->addStretch();
    phase = label("●  EN ATTENTE", "phase"); controlsLine->addWidget(phase);
    deck->addLayout(controlsLine); show->addLayout(deck);
    split->addWidget(left); split->addWidget(right);
    split->setSizes({322, 805}); split->setStretchFactor(0, 0); split->setStretchFactor(1, 1);
    main->addWidget(split, 1);

    auto *footer = new QHBoxLayout;
    message = label({}, "notice"); message->setWordWrap(true); footer->addWidget(message, 1);
    footer->addWidget(label("●  HORS LIGNE", "offline")); main->addLayout(footer);

    auto *menu = new QMenu(more);
    auto *saveAs = menu->addAction("Enregistrer sous…");
    menu->addSeparator();
    auto *png = menu->addAction("Capturer la scène en PNG…");
    auto *wav = menu->addAction("Exporter la piste en WAV…");
    auto *movie = menu->addAction("Exporter la vidéo MP4…");
    menu->addSeparator();
    auto *siwis = menu->addAction("Gérer la voix Siwis HD…");
    auto *info = menu->addAction("À propos de Lectura");
    more->setMenu(menu);
    connect(menu, &QMenu::aboutToShow, this, [this, wav, movie] {
        wav->setEnabled(player.track() && !player.track()->pcm.isEmpty());
        const auto text = script->toPlainText();
        movie->setEnabled(!cancelVideo && !preparing && !text.trimmed().isEmpty() && text.size() <= maxText);
    });
    connect(make, &QPushButton::clicked, this, [this] { if (confirmDiscard()) readProject(newProject(), {}); });
    connect(open, &QPushButton::clicked, this, [this] {
        const auto path = QFileDialog::getOpenFileName(this, "Ouvrir un projet", documentPath(), "Projet Lectura (*.lectura);;Texte brut (*.txt)");
        if (!path.isEmpty() && confirmDiscard()) openPath(path);
    });
    connect(write, &QPushButton::clicked, this, [this] { save(); });
    connect(saveAs, &QAction::triggered, this, [this] { save(true); });
    connect(png, &QAction::triggered, this, &Window::exportPng);
    connect(wav, &QAction::triggered, this, &Window::exportWav);
    connect(movie, &QAction::triggered, this, &Window::exportVideo);
    connect(siwis, &QAction::triggered, this, &Window::manageSiwis);
    connect(info, &QAction::triggered, this, [this] { about(this); });
    connect(cast, &QComboBox::currentIndexChanged, this, [this] {
        if (loading) return;
        project["personnageId"] = cast->currentData().toString(); changed(false); setScene();
    });
    connect(title, &QLineEdit::textChanged, this, [this] { changed(false); });
    connect(script, &QPlainTextEdit::textChanged, this, [this] {
        const auto text = script->toPlainText();
        count->setText(QString::number(text.size()));
        changed(true);
        if (text.size() > maxText) notify("Texte trop long (limite : 12 000 caractères).", true);
    });
    connect(audio, &QComboBox::currentIndexChanged, this, [this] { changed(true); });
    connect(motion, &QComboBox::currentIndexChanged, this, [this] { if (!loading) { changed(false); setScene(); } });
    connect(emotions, &QCheckBox::toggled, this, [this] { if (!loading) { changed(false); setScene(); } });
    connect(reduced, &QCheckBox::toggled, this, [this](bool yes) { QSettings().setValue("stage/reduced", yes); refresh(); });
    connect(pick, &QPushButton::clicked, this, [this] { if (source() == Source::Siwis) manageSiwis(); else chooseAudio(); });
    connect(read, &QPushButton::clicked, this, &Window::playPause);
    connect(stop, &QPushButton::clicked, this, [this] {
        if (preparing && cancel) { cancel->store(true); notify("Annulation de la préparation…"); }
        else { player.stop(); notify("Lecture arrêtée."); }
    });
    connect(mute, &QPushButton::toggled, this, [this](bool yes) { player.mute(yes); mute->setText(yes ? "Rétablir le son" : "Couper le son"); });
    connect(seek, &QSlider::sliderPressed, this, [this] { wasPlaying = player.state() == Transport::State::Playing; if (wasPlaying) player.pause(); });
    connect(seek, &QSlider::valueChanged, this, [this](int pos) { player.seek(pos); });
    connect(seek, &QSlider::sliderReleased, this, [this] { if (wasPlaying && player.state() != Transport::State::Finished) player.play(); wasPlaying = false; });
    new QShortcut(QKeySequence("Ctrl+Return"), this, [this] { if (read->isEnabled()) playPause(); });
    new QShortcut(QKeySequence::Save, this, [this] { save(); });
    new QShortcut(QKeySequence::Open, this, [open] { open->click(); });
    new QShortcut(QKeySequence::New, this, [make] { make->click(); });
    new QShortcut(QKeySequence("Alt+Left"), this, [this] { player.seek(player.position()-5000); });
    new QShortcut(QKeySequence("Alt+Right"), this, [this] { player.seek(player.position()+5000); });
}

Source Window::source() const { return Source(audio->currentData().toInt()); }
int Window::characterRow(const QString &id) const {
    const int row = cast->findData(id);
    return row < 0 ? cast->findData("robot_lectura") : row;
}

void Window::openPath(const QString &path) {
    try {
        const bool text = path.endsWith(".txt", Qt::CaseInsensitive);
        if (text) {
            auto contents = QString::fromUtf8(readFile(path, 65536)).replace("\r\n", "\n").replace('\r','\n');
            if (!contents.isEmpty() && contents.front() == QChar::ByteOrderMark) contents.remove(0, 1);
            if (contents.size() > maxText) fail("Le texte dépasse 12 000 caractères.");
            auto data = newProject(contents); data["titre"] = QFileInfo(path).completeBaseName().left(200);
            readProject(data, {}); dirty = true; updateTitle();
        } else readProject(openProject(path), path);
    } catch (const std::exception &e) { notify(QString::fromUtf8(e.what()), true); }
}

void Window::readProject(QJsonObject data, const QString &path) {
    loading = true; project = std::move(data); projectPath = path; audioPath.clear();
    title->setText(project.value("titre").toString()); script->setPlainText(project.value("texte").toString());
    cast->setCurrentIndex(characterRow(project.value("personnageId").toString()));
    const auto settings = project.value("reglages").toObject(), input = project.value("audio").toObject();
    motion->setCurrentIndex(std::max(0, motion->findData(settings.value("mouvements").toString())));
    emotions->setChecked(settings.value("emotions").toBool(true));
    const auto voice = input.value("voix").toObject();
    const auto mode = input.value("modeLinux").toString();
    const auto inputSource = input.value("source").toString() == "fichier" ? Source::File : mode == "muet" ? Source::Silent
        : mode != "espeak" && voice.value("moteur").toString() == "piper" && voice.value("id").toString() == "siwis" ? Source::Siwis : Source::LocalVoice;
    audio->setCurrentIndex(audio->findData(int(inputSource)));
    loading = false; dirty = false; updateTitle(); resetReading();
    if (inputSource == Source::File) notify("Projet ouvert. Réimporte le fichier sonore pour le lire.");
    else if (cast->currentData().toString() != project.value("personnageId").toString())
        notify("Personnage indisponible : aperçu avec Robot Lectura. Le choix d’origine est conservé.");
    else notify(path.isEmpty() ? "Choisis un personnage, puis lance la lecture." : "Projet ouvert.");
}

void Window::syncProject() {
    const auto text = script->toPlainText();
    if (project.value("texte").toString() != text && project.value("timing").toString() == "sous-titres")
        project["timing"] = "auto";
    project["texte"] = text; project["titre"] = title->text();
    auto a = project.value("audio").toObject();
    const bool file = source() == Source::File;
    a["source"] = file ? "fichier" : "voix";
    if (file && !audioPath.isEmpty()) a["nomFichier"] = QFileInfo(audioPath).fileName();
    if (auto track = player.track()) a["dureeMs"] = track->duration;
    if (source() == Source::Silent) a["modeLinux"] = "muet";
    else if (source() == Source::LocalVoice) a["modeLinux"] = "espeak";
    else a.remove("modeLinux");
    if (source() == Source::Siwis) {
        auto voice = a.value("voix").toObject();
        voice["moteur"] = "piper"; voice["id"] = "siwis"; a["voix"] = voice;
    }
    project["audio"] = a;
    auto r = project.value("reglages").toObject();
    r["mouvements"] = motion->currentData().toString(); r["emotions"] = emotions->isChecked(); project["reglages"] = r;
}

void Window::changed(bool invalidates) {
    if (loading) return;
    syncProject(); dirty = true; updateTitle();
    if (invalidates) { resetReading(); notify({}); }
}

void Window::resetReading() {
    if (cancel) cancel->store(true);
    // Configure the new scene before any refresh at the old media time.
    player.load(nullptr); setScene(); controls();
}

void Window::setScene() {
    const auto &art = characters.at(cast->currentIndex());
    character->setText(art.name);
    const auto track = player.track();
    try {
        stage->configure(art, track ? track->animation(project) : Track().animation(project));
        idle.restart(); lastFrame = -2; refresh();
    } catch (const std::exception &error) { notify(QString::fromUtf8(error.what()), true); }
}

void Window::playPause() {
    if (preparing || cancelVideo) return;
    if (player.state() == Transport::State::Playing) { player.pause(); return; }
    if (player.track()) { notify({}); player.play(); }
    else begin();
}
void Window::begin() {
    if (!ensureSource()) return;
    syncProject();
    cancel = std::make_shared<std::atomic_bool>(false);
    preparing = true; controls(); notify("Préparation locale de la lecture…");
    job.setFuture(QtConcurrent::run([input = request(), token = cancel] {
        try { return Prepared{std::make_shared<Track>(prepare(input, token.get())), {}}; }
        catch (const std::exception &e) { return Prepared{nullptr, QString::fromUtf8(e.what())}; }
    }));
}
void Window::prepared() {
    const bool cancelled = cancel && cancel->load();
    cancel.reset(); preparing = false; controls();
    if (cancelled) { notify("Préparation annulée."); return; }
    auto result = job.result();
    if (!result.track) { notify(result.error, true); return; }
    player.load(std::move(result.track)); setScene();
    notify(source() == Source::File && project.value("timing").toString() != "sous-titres" ? "Synchronisation estimée d’après le texte et la durée." : QString());
    player.play();
}

void Window::refresh() {
    using State = Transport::State;
    const auto state = player.state(); const auto track = player.track();
    const double ms = player.position();
    if (!seek->isSliderDown()) { const QSignalBlocker block(seek); seek->setValue(int(ms)); }
    timecode->setText(time(ms) + " / " + time(track ? track->duration : 0));
    const bool rest = state == State::Empty || state == State::Ready;
    const bool low = reduced->isChecked();
    const double wait = rest && !low && idle.isValid() ? (idle.elapsed()/40)*40. : 0;
    const double t = rest ? -1 : ms;
    if (t == lastFrame && wait == lastIdle && low == lastReduced) return;
    lastFrame = t; lastIdle = wait; lastReduced = low;
    if (isMinimized()) { lastFrame = -2; return; }
    try {
        const int chars = stage->frame(t, track ? track->level(t) : 0, low, wait);
        transcript(track ? track->text : QString(), chars);
    } catch (const std::exception &error) { notify(QString::fromUtf8(error.what()), true); }
}

void Window::controls() {
    using State = Transport::State;
    const auto s = player.state(); const auto track = player.track();
    read->setEnabled(!preparing && !cancelVideo && !script->toPlainText().trimmed().isEmpty() && script->toPlainText().size() <= maxText);
    read->setText(preparing ? "Préparation…" : s == State::Playing ? "Ⅱ  Pause" : s == State::Paused ? "▶  Reprendre" : s == State::Finished ? "↻  Relire" : "▶  Lire");
    stop->setEnabled(preparing || s == State::Playing || s == State::Paused || s == State::Finished);
    stop->setText(preparing ? "Annuler" : "Arrêter");
    mute->setEnabled(source() != Source::Silent);
    { const QSignalBlocker block(seek); seek->setRange(0, track ? track->duration : 0); }
    seek->setEnabled(bool(track));
    const QString filename = audioPath.isEmpty() ? project.value("audio").toObject().value("nomFichier").toString() : QFileInfo(audioPath).fileName();
    const QString sound = source() == Source::File ? (audioPath.isEmpty() ? filename.isEmpty() ? "Aucun fichier" : "À réimporter : " + filename : filename)
        : source() == Source::Silent ? "Répétition muette"
        : source() == Source::Siwis ? siwisInstalled() ? "Modèle Siwis installé" : "Modèle non installé" : "Via eSpeak NG";
    pick->setText(source() == Source::Siwis ? siwisInstalled() ? "Gérer Siwis…" : "Installer Siwis…" : "Importer un audio…");
    receipt->setText(sound); receipt->setToolTip(sound);
    phase->setText(preparing ? "●  PRÉPARATION" : s == State::Playing ? "●  EN LECTURE" : s == State::Paused ? "●  EN PAUSE"
        : s == State::Finished ? "●  TERMINÉ" : "●  EN ATTENTE");
}

void Window::transcript(const QString &text, int chars) {
    const int end = visiblePrefix(text, chars);
    if (text == terminalText && end == visibleChars) return;
    if (text != terminalText || end < visibleChars) { terminal->clear(); terminalText = text; visibleChars = 0; }
    auto cursor = terminal->textCursor(); cursor.movePosition(QTextCursor::End);
    appendTranscript(cursor, text, visibleChars, end);
    visibleChars = end;
    terminal->setTextCursor(cursor); terminal->ensureCursorVisible();
}

void Window::chooseAudio() {
    const auto path = QFileDialog::getOpenFileName(this, "Importer le son", documentPath(),
        "Audio (*.wav *.mp3 *.ogg *.opus *.flac *.m4a *.aac *.webm);;Tous les fichiers (*)");
    if (path.isEmpty()) return;
    audioPath = path;
    { const QSignalBlocker block(audio); audio->setCurrentIndex(audio->findData(int(Source::File))); }
    changed(true);
    notify("Audio associé. Appuie sur Lire pour le préparer.");
}

Request Window::request() const { return {project, source(), audioPath, assetPath, siwisModelPath()}; }

bool Window::ensureSource() {
    if (source() == Source::File && audioPath.isEmpty()) chooseAudio();
    if (source() == Source::Siwis && !siwisInstalled()) manageSiwis();
    return (source() != Source::File || !audioPath.isEmpty()) && (source() != Source::Siwis || siwisInstalled());
}

void Window::manageSiwis() {
    if (preparing || cancelVideo) { notify("Attends la fin de la préparation ou clique sur Annuler."); return; }
    QMessageBox box(QMessageBox::Information, "Voix Siwis HD", QString(
        "Siwis est une voix française plus naturelle. Le modèle n’est pas inclus dans le .deb : télécharge le fichier .onnx (60 Mio) une fois, "
        "puis importe-le. La synthèse se fait uniquement sur cet ordinateur.\n\n"
        "Voix Piper fr_FR-siwis-medium · SIWIS French Speech Synthesis Database, Université d’Édimbourg, CC BY 4.0."), QMessageBox::Close, this);
    box.setTextFormat(Qt::PlainText);
    auto *download = box.addButton("Télécharger le modèle", QMessageBox::ActionRole);
    auto *install = box.addButton("Importer le fichier…", QMessageBox::AcceptRole);
    auto *remove = QFileInfo::exists(siwisModelPath()) ? box.addButton("Supprimer la voix", QMessageBox::DestructiveRole) : nullptr;
    box.exec();
    if (box.clickedButton() == download) {
        if (QDesktopServices::openUrl(QUrl(QString::fromLatin1(siwisModelUrl)))) notify("Quand le téléchargement est terminé, importe le fichier siwis.onnx.");
        else notify(QString("Télécharge le modèle ici : %1").arg(QString::fromLatin1(siwisModelUrl)), true);
    } else if (box.clickedButton() == install) {
        const auto file = QFileDialog::getOpenFileName(this, "Importer le modèle Siwis", QStandardPaths::writableLocation(QStandardPaths::DownloadLocation), "Modèle Siwis (*.onnx)");
        if (file.isEmpty()) return;
        try {
            installSiwis(file, siwisModelPath());
            if (source() == Source::Siwis) resetReading();
            notify("Voix Siwis installée et vérifiée. Choisis-la dans « Son ».");
        } catch (const std::exception &e) { notify(QString::fromUtf8(e.what()), true); }
        controls();
    } else if (remove && box.clickedButton() == remove && QMessageBox::question(this, "Supprimer Siwis ?", "Supprimer la copie locale du modèle ?") == QMessageBox::Yes) {
        if (QFile::remove(siwisModelPath())) {
            if (source() == Source::Siwis) resetReading();
            notify("Modèle Siwis supprimé. La voix eSpeak NG reste disponible.");
        } else notify("Impossible de supprimer le modèle Siwis.", true);
        controls();
    }
}

void Window::notify(const QString &text, bool error) {
    message->setStyleSheet(error ? "color: #ffb6bf;" : "");
    message->setText(text.isEmpty() ? QString("Les projets et les médias restent sur cet ordinateur.") : text);
}
void Window::updateTitle() {
    setWindowTitle("Lectura · " + (title->text().trimmed().isEmpty() ? QString("Sans titre") : title->text()) + (dirty ? " *" : ""));
}
bool Window::confirmDiscard() {
    if (!dirty) return true;
    const auto response = QMessageBox::question(this, "Modifications non enregistrées", "Enregistrer les modifications du projet ?",
        QMessageBox::Save | QMessageBox::Discard | QMessageBox::Cancel, QMessageBox::Save);
    return response == QMessageBox::Discard || (response == QMessageBox::Save && save());
}
bool Window::save(bool as) {
    syncProject();
    if (script->toPlainText().size() > maxText) { notify("Le texte dépasse 12 000 caractères.", true); return false; }
    auto path = projectPath;
    if (as || path.isEmpty()) {
        path = QFileDialog::getSaveFileName(this, "Enregistrer le projet", QDir(documentPath()).filePath(suggestedName(project, ".lectura")), "Projet Lectura (*.lectura)");
        if (path.isEmpty()) return false;
        path = ensureExtension(path, ".lectura");
    }
    try {
        project["modifieLe"] = QDateTime::currentDateTimeUtc().toString(Qt::ISODateWithMs);
        saveProject(path, project); projectPath = path; dirty = false; updateTitle();
        notify("Projet enregistré · " + QFileInfo(path).fileName()); return true;
    } catch (const std::exception &e) { notify(QString::fromUtf8(e.what()), true); return false; }
}
void Window::exportPng() {
    const auto path = QFileDialog::getSaveFileName(this, "Capturer la scène", QDir(documentPath()).filePath(suggestedName(project, ".png")), "Image PNG (*.png)");
    if (path.isEmpty()) return;
    if (content->grab().save(ensureExtension(path, ".png"), "PNG")) notify("Capture PNG enregistrée.");
    else notify("Impossible d’enregistrer la capture.", true);
}
void Window::exportWav() {
    const auto track = player.track();
    if (!track || track->pcm.isEmpty()) return;
    const auto path = QFileDialog::getSaveFileName(this, "Exporter la piste sonore", QDir(documentPath()).filePath(suggestedName(project, ".wav")), "Audio WAV (*.wav)");
    if (path.isEmpty()) return;
    try { saveFile(ensureExtension(path, ".wav"), track->wav()); notify("Piste WAV enregistrée."); }
    catch (const std::exception &e) { notify(QString::fromUtf8(e.what()), true); }
}
void Window::exportVideo() {
    if (preparing || cancelVideo || script->toPlainText().trimmed().isEmpty()) return;
    if (!ensureSource()) return;
    const QStringList formats{"Paysage · 1280 × 720", "Portrait · 720 × 1280"};
    bool ok = false;
    const auto layout = QInputDialog::getItem(this, "Exporter en MP4", "Format vidéo · 30 images/s", formats,
        QSettings().value("export/portrait", false).toBool() ? 1 : 0, false, &ok);
    if (!ok) return;
    const bool portrait = layout == formats.at(1);
    QFileDialog file(this, "Enregistrer la vidéo", documentPath(), "Vidéo MP4 (*.mp4)");
    file.setAcceptMode(QFileDialog::AcceptSave);
    file.setDefaultSuffix("mp4");
    file.selectFile(suggestedName(project, ".mp4"));
    if (!file.exec() || file.selectedFiles().isEmpty()) return;
    videoPath = file.selectedFiles().constFirst();
    if (!videoPath.endsWith(".mp4", Qt::CaseInsensitive)) { notify("Choisis un nom de fichier terminé par .mp4.", true); return; }
    QSettings().setValue("export/portrait", portrait);
    player.pause(); syncProject();
    const auto options = VideoOptions{portrait ? VideoFormat::Portrait : VideoFormat::Landscape, reduced->isChecked()};
    cancelVideo = std::make_shared<std::atomic_bool>(false);
    percent = std::make_shared<std::atomic_int>(-1);
    exportDialog = new QProgressDialog("Préparation de la piste sonore…", "Annuler", 0, 0, this);
    exportDialog->setWindowTitle("Export vidéo local");
    exportDialog->setMinimumDuration(0);
    exportDialog->setAutoClose(false);
    exportDialog->setAutoReset(false);
    exportDialog->setMinimumWidth(360);
    connect(exportDialog, &QProgressDialog::canceled, this, [this] {
        if (cancelVideo) cancelVideo->store(true);
        notify("Annulation de l’export vidéo…");
    });
    exportDialog->show();
    controls();
    notify("Export vidéo en cours. Le fichier est enregistré seulement à la fin.");
    encoder.setFuture(QtConcurrent::run([data = request(), audio = player.track(), options, destination = videoPath,
        art = characters.at(cast->currentIndex()), token = cancelVideo, counter = percent] () mutable {
        try {
            if (!audio) audio = std::make_shared<Track>(prepare(data, token.get()));
            counter->store(0);
            exportMp4(data.assets, art, *audio, data.project, destination, options, token.get(),
                [&](int value) { counter->store(value, std::memory_order_relaxed); });
            return Exported{true, {}};
        } catch (const std::exception &e) { return Exported{false, QString::fromUtf8(e.what())}; }
    }));
}
void Window::videoProgress() {
    if (!exportDialog || !exportDialog->isVisible() || !percent) return;
    const int p = percent->load(std::memory_order_relaxed);
    if (p < 0) return;
    if (exportDialog->maximum() == 0) {
        exportDialog->setRange(0, 100);
        exportDialog->setLabelText("Encodage de la scène et de l’audio…");
    }
    if (p != exportDialog->value()) exportDialog->setValue(p);
}
void Window::videoFinished() {
    const auto result = encoder.result();
    const bool cancelled = cancelVideo && cancelVideo->load();
    cancelVideo.reset(); percent.reset();
    if (exportDialog) { exportDialog->hide(); exportDialog->deleteLater(); exportDialog = nullptr; }
    controls();
    if (result.wrote) notify("Vidéo MP4 enregistrée · " + QFileInfo(videoPath).fileName());
    else if (cancelled) notify("Export vidéo annulé. Aucun fichier partiel n’a été conservé.");
    else notify(result.error, true);
}

void Window::closeEvent(QCloseEvent *event) {
    if (!confirmDiscard()) { event->ignore(); return; }
    QSettings().setValue("window/geometry", saveGeometry());
    if (cancel) cancel->store(true);
    if (cancelVideo) cancelVideo->store(true);
    QMainWindow::closeEvent(event);
}
}
