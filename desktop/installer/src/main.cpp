#include <QCommandLineParser>
#include <QGuiApplication>
#include <QIcon>
#include <QQmlApplicationEngine>
#include <QQuickStyle>

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
    parser.process(app);

    QQmlApplicationEngine engine;
    engine.setInitialProperties({{QStringLiteral("reducedMotion"), parser.isSet(reducedMotion)}});
    QObject::connect(&engine, &QQmlApplicationEngine::objectCreationFailed,
        &app, [] { QCoreApplication::exit(1); }, Qt::QueuedConnection);
    engine.loadFromModule(QStringLiteral("LmBox.Installer"), QStringLiteral("Welcome"));
    return app.exec();
}
