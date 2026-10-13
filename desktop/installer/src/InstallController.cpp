#include "InstallController.h"
#include <QCoreApplication>
#include <QDir>
#include <QFileInfo>
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>

InstallController::InstallController(QString catalog, QObject *parent)
    : QObject(parent), m_catalog(std::move(catalog))
{
#ifdef Q_OS_WIN
    const QString filename = QStringLiteral("lmbox-module-manager.exe");
#else
    const QString filename = QStringLiteral("lmbox-module-manager");
#endif
    m_helper = QDir(QCoreApplication::applicationDirPath()).filePath(filename);
    if (!QFileInfo::exists(m_helper)) m_helper = QString::fromUtf8(LMBOX_MODULE_MANAGER);
    connect(&m_process, &QProcess::readyReadStandardOutput, this, &InstallController::readOutput);
    connect(&m_process, &QProcess::errorOccurred, this, [this](QProcess::ProcessError error) {
        if (error == QProcess::FailedToStart) {
            m_busy = false; m_error = true;
            m_message = QStringLiteral("无法启动模块安装程序，请重新打包安装器。"); emit changed();
        }
    });
    connect(&m_process, &QProcess::finished, this, [this](int exitCode, QProcess::ExitStatus exitStatus) {
        readOutput();
        m_busy = false;
        if (m_cancelled) m_message = QStringLiteral("安装已取消，原有模块保持可用。");
        else if (exitCode != 0 || exitStatus != QProcess::NormalExit) {
            if (!m_error) m_message = QStringLiteral("安装失败，请检查下载源后重试。");
            m_error = true;
        } else if (m_operation == QStringLiteral("install")) {
            m_complete = true; m_progress = 1; m_message = QStringLiteral("安装完成");
        }
        emit changed();
    });
}
void InstallController::start(const QStringList &arguments) {
    if (m_busy) return;
    m_operation = arguments.first(); m_busy = true; m_cancelled = false; m_error = false; m_buffer.clear();
    m_process.setProgram(m_helper); m_process.setArguments(arguments);
    m_process.start(); emit changed();
}
void InstallController::refresh() {
    if (m_busy) return;
    m_ready = false; m_message = QStringLiteral("正在读取模块清单…");
    QStringList args{QStringLiteral("catalog")};
    if (!m_catalog.isEmpty()) args << QStringLiteral("--catalog") << m_catalog;
    start(args);
}
void InstallController::install(const QStringList &modules) {
    if (!m_ready || m_busy) return;
    for (const auto &id : modules) if (!m_modules.contains(id)) {
        m_message = QStringLiteral("所选模块尚未发布，请刷新清单。"); emit changed(); return;
    }
    m_complete = false; m_progress = 0; m_message = QStringLiteral("正在安装…");
    QStringList args{QStringLiteral("install"), QStringLiteral("--modules"), modules.join(',')};
    if (!m_catalog.isEmpty()) args << QStringLiteral("--catalog") << m_catalog;
    start(args);
}
void InstallController::resetSelection() {
    if (!m_busy && m_complete) { m_complete = false; m_message.clear(); emit changed(); }
}
void InstallController::cancel() {
    if (!m_busy) return;
    m_cancelled = true; m_process.kill();
}
void InstallController::launch() {
    if (!m_complete || m_busy) return;
    start({QStringLiteral("launch")});
}
void InstallController::readOutput() {
    m_buffer += m_process.readAllStandardOutput();
    if (m_buffer.size() > 4 * 1024 * 1024) { m_process.kill(); m_error = true; m_message = QStringLiteral("安装响应过大。"); return; }
    qsizetype newline;
    while ((newline = m_buffer.indexOf('\n')) >= 0) { record(m_buffer.left(newline)); m_buffer.remove(0, newline + 1); }
}
void InstallController::record(const QByteArray &line) {
    QJsonParseError error;
    const auto document = QJsonDocument::fromJson(line, &error);
    if (error.error != QJsonParseError::NoError || !document.isObject()) return;
    const auto object = document.object();
    const auto phase = object.value(QStringLiteral("phase")).toString();
    if (phase == QStringLiteral("error")) {
        m_error = true; m_message = object.value(QStringLiteral("message")).toString();
    } else if (m_operation == QStringLiteral("catalog") && object.contains(QStringLiteral("packages"))) {
        m_modules.clear();
        for (const auto &item : object.value(QStringLiteral("packages")).toArray()) {
            const auto package = item.toObject();
            if (package.value(QStringLiteral("kind")).toString() == QStringLiteral("module"))
                m_modules.append(package.value(QStringLiteral("id")).toString());
        }
        m_ready = true; m_message.clear();
    } else if (phase == QStringLiteral("download") || phase == QStringLiteral("extract")) {
        const double total = object.value(QStringLiteral("total")).toDouble();
        m_progress = total > 0 ? object.value(QStringLiteral("completed")).toDouble() / total : 0;
        m_message = (phase == QStringLiteral("download") ? QStringLiteral("正在下载 ") : QStringLiteral("正在解压 "))
            + object.value(QStringLiteral("package")).toString();
    }
    emit changed();
}
