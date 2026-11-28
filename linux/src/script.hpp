#pragma once

#include "model.hpp"
#include <QDeadlineTimer>
#include <quickjs.h>
#include <array>
#include <memory>

namespace lectura {
// Only bundled animation/voice functions are evaluated. The context has no OS bindings.
class Script {
public:
    struct Bytes { const void *data; qsizetype size; };
    Script(const QString &file, const char *bundle) : bundle_(bundle) {
        if (!runtime) fail("Moteur de script local indisponible.");
        JS_SetMemoryLimit(runtime.get(), 32 * 1024 * 1024);
        JS_SetMaxStackSize(runtime.get(), 1024 * 1024);
        JS_SetInterruptHandler(runtime.get(), [](JSContext *, void *p) { return int(static_cast<Script *>(p)->deadline.hasExpired()); }, this);
        ctx.reset(JS_NewContext(runtime.get()));
        if (!ctx) fail("Contexte de script local indisponible.");
        const auto code = readFile(file, 1024 * 1024), name = file.toUtf8();
        deadline.setRemainingTime(1500);
        const Value result{ctx.get(), JS_Eval(ctx.get(), code.constData(), code.size(), name.constData(), JS_EVAL_TYPE_GLOBAL)};
        check(result.v);
    }
    template<class ...Args> QByteArray call(const char *name, Args &&...args) {
        return invoke(false, name, args...);
    }
    template<class ...Args> QByteArray binary(const char *name, Args &&...args) {
        return invoke(true, name, args...);
    }
private:
    struct Value {
        JSContext *ctx;
        JSValue v;
        ~Value() { JS_FreeValue(ctx, v); }
    };
    void check(JSValueConst v) {
        if (!JS_IsException(v)) return;
        const Value error{ctx.get(), JS_GetException(ctx.get())};
        const auto message = JS_ToCString(ctx.get(), error.v);
        const auto detail = QString::fromUtf8(message ? message : "erreur interne").left(260);
        if (message) JS_FreeCString(ctx.get(), message);
        fail(QString::fromLatin1(bundle_) + " : " + detail);
    }
    JSValue arg(const QByteArray &v) { return JS_NewStringLen(ctx.get(), v.constData(), v.size()); }
    JSValue arg(double v) { return JS_NewFloat64(ctx.get(), v); }
    JSValue arg(bool v) { return JS_NewBool(ctx.get(), v); }
    JSValue arg(Bytes v) { return JS_NewArrayBufferCopy(ctx.get(), static_cast<const uint8_t *>(v.data), v.size); }
    template<class ...Args> QByteArray invoke(bool raw, const char *name, Args &&...args) {
        deadline.setRemainingTime(750);
        const auto c = ctx.get();
        const Value global{c, JS_GetGlobalObject(c)}, module{c, JS_GetPropertyStr(c, global.v, bundle_)};
        check(module.v);
        const Value f{c, JS_GetPropertyStr(c, module.v, name)};
        check(f.v);
        const std::array<Value, sizeof...(Args)> owned{Value{c, arg(args)}...};
        std::array<JSValue, sizeof...(Args)> values;
        for (size_t i = 0; i < owned.size(); ++i) { check(owned[i].v); values[i] = owned[i].v; }
        const Value out{c, JS_Call(c, f.v, module.v, int(values.size()), values.data())};
        check(out.v);
        if (JS_IsUndefined(out.v)) return {};
        size_t size = 0;
        if (raw) {
            const auto *bytes = JS_GetArrayBuffer(c, &size, out.v);
            if (!bytes && size) fail("Données du script indisponibles.");
            return QByteArray(reinterpret_cast<const char *>(bytes), qsizetype(size));
        }
        const auto *text = JS_ToCStringLen(c, &size, out.v);
        if (!text) fail("Résultat du script indisponible.");
        const QByteArray result(text, qsizetype(size));
        JS_FreeCString(c, text);
        return result;
    }
    std::unique_ptr<JSRuntime, decltype(&JS_FreeRuntime)> runtime{JS_NewRuntime(), JS_FreeRuntime};
    std::unique_ptr<JSContext, decltype(&JS_FreeContext)> ctx{nullptr, JS_FreeContext};
    QDeadlineTimer deadline;
    const char *bundle_;
};
}
