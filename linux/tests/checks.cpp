#include "model.hpp"
#include "stage.hpp"
#include "transport.hpp"
#include "window.hpp"

#include <QAudioDevice>
#include <QComboBox>
#include <QDir>
#include <QJsonDocument>
#include <QLabel>
#include <QMediaDevices>
#include <QProcess>
#include <QPushButton>
#include <QSlider>
#include <QStandardPaths>
#include <QTemporaryDir>
#include <QTest>
#include <QTextEdit>
#include <QXmlStreamReader>
#include <QtEndian>
#include <cmath>
#include <stdexcept>

using namespace lectura;

namespace {
const QString assets = LECTURA_TEST_ASSETS;
const QString text = "Bonjour ! Bienvenue à Ouagadougou.\n# Pas à pas\n$ lectura --bonjour\nMarche vers moi, puis regarde.\nBravo !";
const QStringList ids = {"aicha", "charlotte", "doriane", "monique", "prisca", "robot_lectura", "robot_rouge"};

Track tone() {
    Track track;
    track.duration = 3000;
    track.pcm = QByteArray(3*Track::rate*Track::frameBytes, '\0');
    auto *samples = track.pcm.data();
    for (int i = Track::rate/2; i < Track::rate*5/2; ++i) {
        const qint16 amplitude = qint16(std::sin(i*.0575958653)*10500);
        qToLittleEndian(amplitude, samples+i*4);
        qToLittleEndian(amplitude, samples+i*4+2);
    }
    track.analyze();
    return track;
}

QString pathAttr(const QByteArray &svg, const QString &id, const QString &attr) {
    QXmlStreamReader r(svg);
    while (!r.atEnd()) {
        r.readNext();
        if (r.isStartElement() && r.attributes().value("id") == id) return r.attributes().value(attr).toString();
    }
    return {};
}
}

class DesktopChecks : public QObject {
    Q_OBJECT
private Q_SLOTS:
    void initTestCase();
    void projectsAndSilent();
    void allRigs();
    void importedAudio();
    void offlineVoice();
    void audioControls();
    void windowControls();
};

void DesktopChecks::initTestCase() { QStandardPaths::setTestModeEnabled(true); }

void DesktopChecks::projectsAndSilent() {
    QTemporaryDir tmp;
    auto project = newProject(text);
    project["personnageId"] = "moussa";
    project["extension"] = "métadonnée PWA";
    saveProject(tmp.filePath("Épisode.lectura"), project);
    QCOMPARE(openProject(tmp.filePath("Épisode.lectura")), project);
    const auto track = prepare({project, Source::Silent, {}});
    QCOMPARE(track.text, text);
    QVERIFY(track.pcm.isEmpty());
    QVERIFY(track.duration > 3000);
    QVERIFY(track.cues.size() >= 5);
    QCOMPARE(track.cues.front().start, 0);
    QCOMPARE(track.cues.back().end, track.duration);
    for (const auto &cue : track.cues) {
        QCOMPARE(track.text.mid(cue.offset, cue.text.size()), cue.text);
        QCOMPARE(cue.spoken, !cue.text.startsWith('$') && !cue.text.startsWith('#'));
    }
    project["version"] = 2;
    saveProject(tmp.filePath("future.lectura"), project);
    QVERIFY_EXCEPTION_THROWN(openProject(tmp.filePath("future.lectura")), std::runtime_error);
    const std::atomic_bool cancelled(true);
    QVERIFY_EXCEPTION_THROWN(prepare({newProject(text), Source::LocalVoice, {}}, &cancelled), std::runtime_error);
}

void DesktopChecks::allRigs() {
    const auto arts = catalogue(QDir(assets).filePath("characters"));
    QCOMPARE(arts.size(), ids.size());
    const auto project = newProject(text);
    auto track = prepare({project, Source::Silent, {}});
    Motion motion(assets);
    for (qsizetype i = 0; i < arts.size(); ++i) {
        const auto &art = arts.at(i);
        qInfo("Rig Linux : %s", qPrintable(art.name));
        QCOMPARE(art.id, ids.at(i));
        QVERIFY(!art.icon.isNull());
        motion.configure(art, track.animation(project));
        const auto rest = motion.frame(-1, 0, true);
        const auto a = motion.frame(420, .95), b = motion.frame(905, .95);
        QVERIFY(a.chars > 0 && b.chars > a.chars);
        QVERIFY(a.svg != b.svg);
        QCOMPARE(motion.frame(420, .95).svg, a.svg);
        QCOMPARE(motion.frame(track.duration).chars, int(text.size()));
        for (const auto &frame : {rest, a, b}) {
            QVERIFY(!frame.svg.contains("NaN"));
            const auto img = rasterize(frame.svg, {250, 310});
            int count = 0;
            for (int y = 0; y < img.height(); ++y) for (int x = 0; x < img.width(); ++x) if (qAlpha(img.pixel(x,y)) > 16) ++count;
            QVERIFY2(count > 1250, qPrintable(art.name));
        }
        if (art.human()) {
            bool lipsChanged = false;
            for (const auto ms : {250., 350., 420., 505., 580.}) lipsChanged |= motion.frame(ms, .9, true).svg != motion.frame(ms, 0, true).svg;
            QVERIFY(lipsChanged);
            const auto slow = motion.frame(420, 0, true).svg;
            QCOMPARE(motion.frame(420, 0, true, 4560).svg, slow);
        } else {
            const auto open = pathAttr(a.svg, "mouth", "height");
            const auto shut = pathAttr(motion.frame(420, 0).svg, "mouth", "height");
            QVERIFY(open.toDouble() > shut.toDouble());
        }
    }
    QCOMPARE(motion.corridor(263., 15.).value("tiles").toArray().size(), 17);
}

void DesktopChecks::importedAudio() {
    QTemporaryDir tmp;
    const auto fixture = tone();
    const auto wav = tmp.filePath("voix.wav"), mp3 = tmp.filePath("voix locale.mp3");
    saveFile(wav, fixture.wav());
    QVERIFY(fixture.wav().startsWith("RIFF"));
    QCOMPARE(QProcess::execute("ffmpeg", {"-nostdin", "-v", "error", "-i", wav, "-c:a", "libmp3lame", mp3}), 0);
    auto project = newProject("Bonjour.\nVoici mon enregistrement.");
    project["timing"] = "sous-titres";
    project["segments"] = QJsonArray{
        QJsonObject{{"texte","Bonjour."}, {"debutMs",240}, {"finMs",1320}},
        QJsonObject{{"texte","Voici mon enregistrement."}, {"debutMs",1350}, {"finMs",2840}, {"expression","content"}}};
    for (const auto &path : {wav, mp3}) {
        const auto t = prepare({project, Source::File, path});
        QVERIFY(std::abs(t.duration-3000) < 80);
        QCOMPARE(t.cues.at(0).start, 240);
        QCOMPARE(t.cues.at(1).expression, QString("content"));
        QCOMPARE(t.level(110), 0.);
        QVERIFY(t.level(900) > .92);
        QCOMPARE(t.level(2890), 0.);
    }
    saveFile(tmp.filePath("invalide.mp3"), "pas une piste");
    QVERIFY_EXCEPTION_THROWN(prepare({project, Source::File, tmp.filePath("invalide.mp3")}), std::runtime_error);
}

void DesktopChecks::offlineVoice() {
    const auto project = newProject("Bonjour !\n# Cette ligne n’est pas prononcée.\nEst-ce que tu m’entends ?");
    const auto t = prepare({project, Source::LocalVoice, {}});
    QVERIFY(!t.pcm.isEmpty());
    QVERIFY(t.duration > 1800);
    QCOMPARE(t.cues.size(), 3);
    const auto &quiet = t.cues.at(1);
    QVERIFY(!quiet.spoken);
    QCOMPARE(quiet.speechEnd, quiet.start);
    QCOMPARE(t.level((quiet.start+quiet.end)*.5), 0.);
    bool voiced = false;
    for (int at = 0; at < t.cues.at(0).speechEnd; at += 16) voiced |= t.level(at) > .9;
    QVERIFY(voiced);
}

void DesktopChecks::audioControls() {
    if (QMediaDevices::defaultAudioOutput().isNull() && !qEnvironmentVariableIsSet("LECTURA_REQUIRE_AUDIO")) QSKIP("Pas de sortie audio.");
    Transport transport;
    bool errored = false;
    connect(&transport, &Transport::audioError, this, [&](const QString &e) { qWarning() << e; errored = true; });
    transport.load(std::make_shared<Track>(tone()));
    transport.play();
    QCOMPARE(transport.state(), Transport::State::Playing);
    QTRY_VERIFY_WITH_TIMEOUT(transport.position() >= 255, 5800);
    transport.pause();
    const double paused = transport.position();
    QTest::qWait(240);
    QCOMPARE(transport.position(), paused);
    transport.seek(1350);
    QCOMPARE(transport.position(), 1350.);
    transport.play();
    QTRY_VERIFY_WITH_TIMEOUT(transport.position() >= 1550, 3800);
    transport.seek(2620);
    QCOMPARE(transport.state(), Transport::State::Playing);
    QTRY_VERIFY_WITH_TIMEOUT((transport.poll(), transport.state() == Transport::State::Finished), 4000);
    QCOMPARE(transport.position(), 3000.);
    transport.stop();
    QCOMPARE(transport.position(), 0.);
    QVERIFY(!errored);
}

void DesktopChecks::windowControls() {
    QTemporaryDir tmp;
    auto p = newProject(text); p["titre"] = "Recette Linux"; p["personnageId"] = "moussa";
    p["audio"] = QJsonObject{{"source", "voix"}, {"modeLinux", "muet"}};
    const auto path = tmp.filePath("Test.lectura"); saveProject(path, p);
    Window window(assets); window.openPath(path); window.show();
    QVERIFY(QTest::qWaitForWindowExposed(&window));
    auto *cast = window.findChild<QComboBox *>("cast");
    auto *read = window.findChild<QPushButton *>("playPause");
    auto *stop = window.findChild<QPushButton *>("stop");
    auto *seek = window.findChild<QSlider *>("seek");
    auto *terminal = window.findChild<QTextEdit *>("terminal");
    auto *status = window.findChild<QLabel *>("phase");
    QVERIFY(cast && read && stop && seek && terminal && status);
    QCOMPARE(cast->count(), 7);
    QCOMPARE(cast->currentData().toString(), QString("robot_lectura"));
    QCOMPARE(openProject(path).value("personnageId").toString(), QString("moussa"));
    cast->setCurrentIndex(cast->findData("prisca"));
    QTest::mouseClick(read, Qt::LeftButton);
    QTRY_VERIFY_WITH_TIMEOUT(seek->value() >= 350 && !terminal->toPlainText().isEmpty(), 4000);
    QTest::mouseClick(read, Qt::LeftButton);
    QVERIFY(status->text().contains("EN PAUSE"));
    seek->setValue(seek->maximum());
    QCOMPARE(terminal->toPlainText(), text);
    QTest::mouseClick(stop, Qt::LeftButton);
    QCOMPARE(seek->value(), 0);
    QVERIFY(terminal->toPlainText().isEmpty());
    const auto *content = window.findChild<QWidget *>("sceneContent");
    QVERIFY(content && content->width() > 340);
    QCOMPARE(window.findChild<QWidget *>("characterStage")->accessibleName(), QString("Scène : Prisca"));
    window.resize(824, 640);
    QTest::qWait(100);
    QVERIFY(content->width() >= 389);
    if (qEnvironmentVariableIsSet("LECTURA_SCREENSHOT")) {
        window.resize(1180, 790);
        seek->setValue(2000);
        QTest::qWait(200);
        QVERIFY(window.grab().save(qEnvironmentVariable("LECTURA_SCREENSHOT"), "PNG"));
    }
}

QTEST_MAIN(DesktopChecks)
#include "checks.moc"
