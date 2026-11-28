#include "stage.hpp"
#include "script.hpp"

#include <QDir>
#include <QJsonDocument>
#include <QPainter>
#include <QRegularExpression>
#include <QXmlStreamReader>
#include <cairo.h>
#include <librsvg/rsvg.h>
#include <algorithm>
#include <cmath>

namespace lectura {
namespace {
// Only bundled SVG is parsed here, never assets passed in a .lectura or picked by the user.
QJsonArray shape(QXmlStreamReader &reader, int depth = 0) {
    if (depth > 40) fail("Le dessin est imbriqué trop profondément.");
    const auto tag = reader.name().toString();
    QJsonObject attr;
    for (const auto &ns : reader.namespaceDeclarations()) {
        const auto prefix = ns.prefix().toString();
        attr.insert(prefix.isEmpty() ? "xmlns" : "xmlns:" + prefix, ns.namespaceUri().toString());
    }
    for (const auto &entry : reader.attributes()) attr.insert(entry.qualifiedName().toString(), entry.value().toString());
    QJsonArray children;
    while (reader.readNextStartElement()) {
        if (reader.name() == QLatin1String("title") || reader.name() == QLatin1String("desc")) reader.skipCurrentElement();
        else children.append(shape(reader, depth+1));
    }
    return QJsonArray{tag, attr, children};
}
QJsonObject object(const QByteArray &data) {
    const auto doc = QJsonDocument::fromJson(data);
    if (!doc.isObject()) fail("Une ressource Lectura est illisible.");
    return doc.object();
}
QByteArray json(const QJsonObject &o) { return QJsonDocument(o).toJson(QJsonDocument::Compact); }
}

QVector<Art> catalogue(const QString &directory) {
    const QDir dir(directory);
    const auto index = object(readFile(dir.filePath("index.json"), 8192)).value("personnages").toArray();
    QVector<Art> out;
    const QRegularExpression identifier("^[a-z0-9_-]+$"), artwork("^[a-z0-9_-]+\\.svg$");
    for (const auto &item : index) {
        const auto id = item.toString();
        if (!identifier.match(id).hasMatch()) fail("Identifiant de personnage invalide.");
        const auto def = object(readFile(dir.filePath(id+".json"), 32768));
        const auto name = def.value("nom").toString(), file = def.value("svg").toString(), scene = def.value("svgScene").toString(file);
        if (def.value("id").toString() != id || name.isEmpty() || !artwork.match(file).hasMatch() || !artwork.match(scene).hasMatch())
            fail("Personnage invalide : " + id);
        const auto drawable = readFile(dir.filePath(scene), 524288);
        QXmlStreamReader svg(drawable);
        if (!svg.readNextStartElement() || svg.name() != QLatin1String("svg")) fail("Dessin SVG invalide : " + id);
        const auto coords = svg.attributes().value("viewBox").toString().split(QRegularExpression("[ ,]+"), Qt::SkipEmptyParts);
        if (coords.size() != 4) fail("Cadrage SVG absent : " + id);
        const QRectF view(coords.at(0).toDouble(), coords.at(1).toDouble(), coords.at(2).toDouble(), coords.at(3).toDouble());
        if (view.isEmpty() || view.width() > 10000 || view.height() > 10000) fail("Cadrage SVG invalide : " + id);
        const auto root = shape(svg);
        if (svg.hasError()) fail("Dessin SVG illisible : " + id);
        const auto preview = scene == file ? drawable : readFile(dir.filePath(file), 524288);
        out.append({id, name, def, QJsonDocument(root).toJson(QJsonDocument::Compact), rasterize(preview, {56, 56}), view});
    }
    if (std::none_of(out.cbegin(), out.cend(), [](const auto &art) { return art.id == "robot_lectura"; }))
        fail("Le catalogue installé ne contient pas Robot Lectura.");
    return out;
}

QImage rasterize(const QByteArray &svg, const QSize &size) {
    if (size.isEmpty()) return {};
    GError *error = nullptr;
    const std::unique_ptr<RsvgHandle, decltype(&g_object_unref)> handle(
        rsvg_handle_new_from_data(reinterpret_cast<const guint8 *>(svg.constData()), svg.size(), &error), g_object_unref);
    auto check = [&] {
        const std::unique_ptr<GError, decltype(&g_error_free)> details(error, g_error_free);
        if (details) fail("Dessin SVG : " + QString::fromUtf8(details->message));
    };
    if (!handle) { check(); fail("Dessin SVG impossible à charger."); }
    QImage image(size, QImage::Format_ARGB32_Premultiplied);
    if (image.isNull()) fail("Mémoire insuffisante pour afficher la scène.");
    image.fill(Qt::transparent);
    const std::unique_ptr<cairo_surface_t, decltype(&cairo_surface_destroy)> surface(
        cairo_image_surface_create_for_data(image.bits(), CAIRO_FORMAT_ARGB32, image.width(), image.height(), int(image.bytesPerLine())),
        cairo_surface_destroy);
    const std::unique_ptr<cairo_t, decltype(&cairo_destroy)> cr(cairo_create(surface.get()), cairo_destroy);
    const RsvgRectangle viewport{0, 0, double(image.width()), double(image.height())};
    if (!rsvg_handle_render_document(handle.get(), cr.get(), &viewport, &error)) { check(); fail("Dessin SVG impossible à afficher."); }
    cairo_surface_flush(surface.get());
    return image;
}

Motion::Motion(const QString &assets) : engine(std::make_unique<Script>(QDir(assets).filePath("motion.js"), "LecturaMotion")) {}
Motion::~Motion() = default;
void Motion::configure(const Art &art, const QJsonObject &track) { engine->call("configure", art.tree, json(art.definition), json(track)); }
Frame Motion::frame(double ms, double level, bool reduced, double idle) {
    const auto f = object(engine->call("frame", ms, level, reduced, idle));
    return {f.value("svg").toString().toUtf8(), f.value("advance").toDouble(), f.value("chars").toInt()};
}
QJsonObject Motion::corridor(double bottom, double advance) { return object(engine->call("corridor", bottom, advance)); }

void SceneCanvas::configure(const Art &art, const QJsonObject &track) {
    motion.configure(art, track);
    view = art.view; human = art.human();
    current = {}; pixels = {}; tiles = {};
}
bool SceneCanvas::frame(double ms, double level, bool reduced, double idle) {
    auto next = motion.frame(ms, level, reduced, idle);
    if (next.svg != current.svg) pixels = {};
    const bool redraw = pixels.isEmpty() || next.advance != current.advance;
    current = std::move(next);
    return redraw;
}
QRectF SceneCanvas::viewport(const QSizeF &surface) const {
    if (view.isEmpty()) return {};
    const qreal k = std::min((surface.width()-14.) / view.width(), (surface.height()-18.) / view.height());
    const QSizeF size = view.size() * k;
    return {QPointF((surface.width()-size.width())/2, (surface.height()-size.height())/2), size};
}

void SceneCanvas::decor(QPainter &p, const QSizeF &surface, const QRectF &target) {
    const auto w = surface.width(), h = surface.height();
    const QRectF area(QPointF(0,0), surface);
    QLinearGradient sky(0, 0, 0, h);
    sky.setColorAt(0, "#15182d"); sky.setColorAt(.48, "#333450"); sky.setColorAt(1, "#14121e");
    p.fillRect(area, sky);
    const qreal k = target.width() / view.width();
    const QPointF origin = target.topLeft() - view.topLeft() * k;
    const qreal bottom = (h - origin.y()) / k;
    if (tiles.isEmpty() || bottom != projectedBottom || current.advance != projectedAdvance) {
        tiles = motion.corridor(bottom, current.advance);
        projectedBottom = bottom; projectedAdvance = current.advance;
    }
    const double horizon = tiles.value("horizon").toDouble(), floor = tiles.value("floor").toDouble();
    const double hz = origin.y() + horizon*k;
    const double center = human ? origin.x() : w/2.0;
    QRadialGradient glow(QPointF(center, hz), w*.57);
    glow.setColorAt(0, QColor(151, 130, 235, 61)); glow.setColorAt(1, QColor(151, 130, 235, 0));
    p.fillRect(area, glow);
    QLinearGradient ground(0, hz, 0, h);
    ground.setColorAt(0, "#2f253d"); ground.setColorAt(1, "#161020");
    p.fillRect(QRectF(0, hz, w, h-hz), ground);
    auto line = [&p](double x1, double y1, double x2, double y2, QColor c, double w, double a) {
        c.setAlphaF(std::clamp(a, 0., 1.));
        p.setPen(QPen(c, std::max(.55, w), Qt::SolidLine, Qt::RoundCap));
        p.drawLine(QPointF(x1,y1), QPointF(x2,y2));
    };
    const QColor blue("#73b3d0"), rose("#dd9bc8");
    line(0,hz,w,hz,blue,1,.26);
    if (!human) {
        for (int i = -5; i <= 5; ++i) line(center,hz,center+i*w/5.,h,blue,.7,.14);
        for (int i = 1; i <= 7; ++i) {
            const double y = hz+(h-hz)*i*i/49.;
            line(0,y,w,y,blue,.75,.13);
        }
        return;
    }
    const double e = (bottom-horizon)/(floor-horizon);
    for (const auto x : {-146, -94, -59, -30, 30, 59, 94, 146})
        line(center,hz,center+x*k*e,h,blue,.8*k,std::abs(x)==59 ? .38 : .22);
    for (const auto &value : tiles.value("tiles").toArray()) {
        const auto t = value.toArray();
        const int n = t.at(0).toInt();
        const double f = t.at(1).toDouble()*k, y = origin.y() + t.at(2).toDouble()*k, a = t.at(3).toDouble();
        line(center-208*f,y,center+208*f,y,blue,.94*f,.46*a);
        for (int side : {-1, 1}) {
            const double edge = center+side*59*f;
            line(edge-3.9*f,y,edge+3.9*f,y,blue,2.3*f,.82*a);
            if (n%3) continue;
            const double x1 = center+side*83*f, y1 = hz-162*f, op = a*t.at(4).toDouble();
            line(x1,y1,x1,hz+56*f,blue,6*f,op*.47);
            line(x1,y1+24*f,x1,y1+88*f,side<0 ? blue : rose,3.4*f,op);
            line(x1,y1,center+side*126*f,y1,rose,1.7*f,op);
        }
    }
}

void SceneCanvas::paint(QPainter &p, const QSizeF &surface, qreal dpr) {
    const auto vp = viewport(surface);
    if (vp.isEmpty() || current.svg.isEmpty()) {
        p.fillRect(QRectF(QPointF(0,0), surface), "#14121e"); return;
    }
    decor(p, surface, vp);
    auto size = (vp.size()*std::min(dpr, 2.)).toSize();
    size.scale(size.boundedTo({2048, 2048}), Qt::KeepAspectRatio);
    if (pixels != size) { portrait = rasterize(current.svg, size); pixels = size; }
    p.drawImage(vp, portrait);
}

Stage::Stage(const QString &assets, QWidget *parent) : QWidget(parent), canvas(assets) {
    setObjectName("characterStage");
    setAccessibleName("Scène du personnage");
    setMinimumSize(214, 210);
    setSizePolicy(QSizePolicy::Expanding, QSizePolicy::Expanding);
    setAttribute(Qt::WA_OpaquePaintEvent);
}
void Stage::configure(const Art &art, const QJsonObject &track) {
    canvas.configure(art, track);
    setAccessibleName("Scène : " + art.name);
}
int Stage::frame(double ms, double level, bool reduced, double idle) {
    if (canvas.frame(ms, level, reduced, idle)) update();
    return canvas.visibleChars();
}
void Stage::paintEvent(QPaintEvent *) {
    QPainter p(this);
    p.setRenderHints(QPainter::Antialiasing | QPainter::SmoothPixmapTransform);
    try { canvas.paint(p, size(), devicePixelRatioF()); }
    catch (const std::exception &error) {
        p.fillRect(rect(), "#14121e");
        p.setPen(QColor("#ecb5bc"));
        p.drawText(rect().adjusted(12,12,-12,-12), Qt::AlignCenter | Qt::TextWordWrap, QString::fromUtf8(error.what()));
    }
}
}
