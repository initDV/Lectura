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
    struct Engine;
    std::unique_ptr<Engine> engine;
};

class Stage final : public QWidget {
public:
    explicit Stage(const QString &assets, QWidget *parent = nullptr);
    void configure(const Art &art, const QJsonObject &track);
    int frame(double ms, double level, bool reduced, double idle);
protected:
    void paintEvent(QPaintEvent *) override;
private:
    QRectF viewport() const;
    void decor(QPainter &p, const QRectF &target);
    Motion motion;
    QImage portrait;
    QRectF view;
    bool human = false;
    Frame current;
    QSize pixels;
    double projectedBottom = 0, projectedAdvance = 0;
    QJsonObject tiles;
};
}
