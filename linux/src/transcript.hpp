#pragma once
#include <QColor>
#include <QTextCursor>
#include <QTextCharFormat>
#include <QStringView>
#include <algorithm>

namespace lectura {
inline int visiblePrefix(const QString &text, int chars) {
    const int end = std::clamp(chars, 0, int(text.size()));
    return end > 0 && end < text.size() && text.at(end-1).isHighSurrogate() ? end-1 : end;
}
inline void appendTranscript(QTextCursor &cursor, const QString &text, int from, int end) {
    for (int at = from; at < end;) {
        const int line = at == 0 ? 0 : int(text.lastIndexOf('\n', at-1))+1;
        const int nl = int(text.indexOf('\n', at));
        const int after = nl < 0 ? end : std::min(end, nl+1);
        const auto prefix = QStringView(text).mid(line, std::min(2, int(text.size())-line));
        QTextCharFormat style;
        style.setForeground(QColor(prefix == u"$ " ? "#c6a6ff" : prefix == u"# " ? "#96a2bc" : "#daf0e9"));
        cursor.insertText(text.mid(at, after-at), style);
        at = after;
    }
}
}
