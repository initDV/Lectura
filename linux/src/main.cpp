#include "window.hpp"

#include <QApplication>
#include <QCommandLineParser>
#include <QDir>
#include <QFileInfo>
#include <QIcon>
#include <QMessageBox>
#include <QPalette>
#include <cstdio>
#include <cstring>

int main(int argc, char **argv) {
    // Let installers query the version on machines without an active display.
    if (argc == 2 && (!std::strcmp(argv[1], "--version") || !std::strcmp(argv[1], "-v"))) {
        std::puts("Lectura " LECTURA_VERSION " (Linux)"); return 0;
    }
    QApplication app(argc, argv);
    QCoreApplication::setOrganizationName("Lectura");
    QCoreApplication::setApplicationName("Lectura");
    QCoreApplication::setApplicationVersion(LECTURA_VERSION);
    QApplication::setDesktopFileName("io.github.initdv.Lectura");
    QCommandLineParser cli;
    cli.setApplicationDescription("Lectura, studio de lecture natif pour Linux.");
    cli.addHelpOption(); cli.addVersionOption();
    cli.addPositionalArgument("projet", "Fichier .lectura ou .txt à ouvrir.");
    cli.process(app);
    if (cli.positionalArguments().size() > 1) cli.showHelp(2);
    const QDir bin(QCoreApplication::applicationDirPath());
    // Installed data live at ../share/lectura; 'assets' is for an uninstalled build.
    const QString packaged = bin.filePath("../" LECTURA_SHARE);
    const QString assets = QFileInfo::exists(QDir(packaged).filePath("motion.js")) ? packaged : bin.filePath("assets");
    try {
        QPalette palette;
        palette.setColor(QPalette::Window, QColor("#181c27"));
        palette.setColor(QPalette::WindowText, QColor("#eeeaf7"));
        palette.setColor(QPalette::Base, QColor("#10141e"));
        palette.setColor(QPalette::AlternateBase, QColor("#202635"));
        palette.setColor(QPalette::Text, QColor("#eeeaf7"));
        palette.setColor(QPalette::Button, QColor("#242938"));
        palette.setColor(QPalette::ButtonText, QColor("#eeeaf7"));
        palette.setColor(QPalette::PlaceholderText, QColor("#8f97af"));
        palette.setColor(QPalette::Highlight, QColor("#75569e"));
        palette.setColor(QPalette::HighlightedText, Qt::white);
        app.setPalette(palette);
        app.setWindowIcon(QIcon(QDir(assets).filePath("lectura.png")));
        app.setStyleSheet(QString::fromUtf8(lectura::readFile(QDir(assets).filePath("theme.qss"), 32768)));
        lectura::Window window(assets);
        if (!cli.positionalArguments().isEmpty()) window.openPath(cli.positionalArguments().constFirst());
        window.show();
        return app.exec();
    } catch (const std::exception &error) {
        const auto text = QString::fromUtf8(error.what());
        qCritical("Lectura : %s", qPrintable(text));
        QMessageBox::critical(nullptr, "Lectura", text);
        return 1;
    }
}
