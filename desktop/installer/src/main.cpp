#include "InstallController.h"
#include <QCommandLineParser>
#include <QGuiApplication>
#include <QIcon>
#include <QQmlApplicationEngine>
#include <QQuickStyle>
#include <QTimer>

int main(int argc, char *argv[])
{
    QGuiApplication app(argc, argv);
    QGuiApplication::setApplicationName(QStringLiteral("lmBox Installer"));
    QGuiApplication::setApplicationVersion(QStringLiteral("0.1.1"));
    QGuiApplication::setOrganizationName(QStringLiteral("lmBox"));
    QGuiApplication::setWindowIcon(QIcon(QStringLiteral(":/installer/assets/pig-still.png")));
    QQuickStyle::setStyle(QStringLiteral("Basic"));

    QCommandLineParser parser;
    parser.setApplicationDescription(QStringLiteral("lmBox installation welcome screen"));
    parser.addHelpOption();
    parser.addVersionOption();
    const QCommandLineOption reducedMotion(QStringLiteral("reduce-motion"),
        QStringLiteral("Display the welcome screen without animations."));
    parser.addOption(reducedMotion);
    const QCommandLineOption catalog(QStringLiteral("catalog"), QStringLiteral("Signed module catalog URL."), QStringLiteral("url"));
    parser.addOption(catalog);
    const QCommandLineOption smokeTest(QStringLiteral("smoke-test"),
        QStringLiteral("Load the installed QML interface and exit for deployment verification."));
    parser.addOption(smokeTest);
    parser.process(app);
    InstallController installer(parser.value(catalog));
    QObject::connect(&app, &QCoreApplication::aboutToQuit, &installer, &InstallController::cancel);

    QQmlApplicationEngine engine;
    engine.setInitialProperties({{QStringLiteral("reducedMotion"), parser.isSet(reducedMotion)},
        {QStringLiteral("installController"), QVariant::fromValue(&installer)}});
    QObject::connect(&engine, &QQmlApplicationEngine::objectCreationFailed,
        &app, [] { QCoreApplication::exit(1); }, Qt::QueuedConnection);
    engine.loadFromModule(QStringLiteral("LmBox.Installer"), QStringLiteral("Welcome"));
    if (parser.isSet(smokeTest))
        QTimer::singleShot(0, &app, [&app, &engine] { app.exit(engine.rootObjects().isEmpty() ? 1 : 0); });
    return app.exec();
}
