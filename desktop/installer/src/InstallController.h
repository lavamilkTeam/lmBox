#pragma once
#include <QObject>
#include <QProcess>
#include <QStringList>

class InstallController final : public QObject {
    Q_OBJECT
    Q_PROPERTY(bool busy READ busy NOTIFY changed)
    Q_PROPERTY(bool ready READ ready NOTIFY changed)
    Q_PROPERTY(bool complete READ complete NOTIFY changed)
    Q_PROPERTY(QString message READ message NOTIFY changed)
    Q_PROPERTY(double progress READ progress NOTIFY changed)
    Q_PROPERTY(QStringList availableModuleIds READ availableModuleIds NOTIFY changed)
public:
    explicit InstallController(QString catalog, QObject *parent = nullptr);
    bool busy() const { return m_busy; }
    bool ready() const { return m_ready; }
    bool complete() const { return m_complete; }
    QString message() const { return m_message; }
    double progress() const { return m_progress; }
    QStringList availableModuleIds() const { return m_modules; }
    Q_INVOKABLE void refresh();
    Q_INVOKABLE void install(const QStringList &modules);
    Q_INVOKABLE void cancel();
    Q_INVOKABLE void resetSelection();
    Q_INVOKABLE void launch();
signals:
    void changed();
private:
    void start(const QStringList &arguments);
    void readOutput();
    void record(const QByteArray &line);
    QString m_catalog;
    QString m_helper;
    QString m_operation;
    QProcess m_process;
    QByteArray m_buffer;
    QStringList m_modules;
    QString m_message;
    bool m_busy = false;
    bool m_ready = false;
    bool m_complete = false;
    bool m_cancelled = false;
    bool m_error = false;
    double m_progress = 0;
};
