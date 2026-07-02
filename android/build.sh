#!/bin/bash

set -e

echo "🚀 Building Graphene PA for GrapheneOS"
echo ""

cd "$(dirname "$0")"

# Commands
BUILD_DEBUG=${1:-debug}

case $BUILD_DEBUG in
    debug)
        echo "📱 Building debug APK..."
        ./gradlew clean assembleDebug
        echo ""
        echo "✅ Debug APK ready at: app/build/outputs/apk/debug/app-debug.apk"
        ;;
    release)
        echo "📦 Building release APK..."
        ./gradlew clean assembleRelease
        echo ""
        echo "✅ Release APK ready at: app/build/outputs/apk/release/app-release.apk"
        echo "⚠️  Note: Release APK needs to be signed before installation"
        ;;
    install)
        echo "📱 Building and installing debug APK..."
        ./gradlew clean installDebug
        echo ""
        echo "✅ App installed on connected device"
        ;;
    clean)
        echo "🧹 Cleaning build files..."
        ./gradlew clean
        echo "✅ Done"
        ;;
    *)
        echo "Usage: ./build.sh [debug|release|install|clean]"
        echo ""
        echo "  debug   - Build debug APK (default)"
        echo "  release - Build release APK (unsigned)"
        echo "  install - Build and install debug APK to device"
        echo "  clean   - Clean build files"
        exit 1
        ;;
esac
