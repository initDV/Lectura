#pragma once

#include "model.hpp"

#include <QImage>
#include <QRectF>
#include <QWidget>
#include <memory>

namespace lectura {
struct Art {
    QString id, name;
    QJsonObject definition;
    QByteArray tree;
    QImage icon;
    QRectF view;
    bool human() const { return definition.value("rig").toString() == "aicha"; }
};
QVector<Art> catalogue(const QString &directory);
QImage rasterize(const QByteArray &svg, const QSize &size);

struct Frame {
    QByteArray svg;
    double advance = 0;
    int chars = 0;
};

class Script;
class Motion {
public:
    explicit Motion(const QString &assets);
    ~Motion();
    Motion(const Motion &) = delete;
    Motion &operator=(const Motion &) = delete;
    void configure(const Art &art, const QJsonObject &track);
    Frame frame(double ms, double level = 0, bool reduced = false, double idle = 0);
    QJsonObject corridor(double bottom, double advance);
private:
    std::unique_ptr<Script> engine;
};

// Pixel painter shared by the live QWidget and the video encoder. No widgets or wall clock.
class SceneCanvas {
public:
    explicit SceneCanvas(const QString &assets) : motion(assets) {}
    void configure(const Art &art, const QJsonObject &track);
    bool frame(double ms, double level, bool reduced, double idle = 0);
    int visibleChars() const { return current.chars; }
    void paint(QPainter &painter, const QSizeF &surface, qreal dpr = 1);
private:
    QRectF viewport(const QSizeF &surface) const;
    void decor(QPainter &p, const QSizeF &surface, const QRectF &target);
    Motion motion;
    QImage portrait;
    QRectF view;
    bool human = false;
    Frame current;
    QSize pixels;
    double projectedBottom = 0, projectedAdvance = 0;
    QJsonObject tiles;
};

class Stage final : public QWidget {
public:
    explicit Stage(const QString &assets, QWidget *parent = nullptr);
    void configure(const Art &art, const QJsonObject &track);
    int frame(double ms, double level, bool reduced, double idle);
protected:
    void paintEvent(QPaintEvent *) override;
private:
    SceneCanvas canvas;
};
}
