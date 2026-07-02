plugins {
    id("com.android.application") version "8.1.0" apply false
}

task("clean", Delete::class) {
    delete(rootProject.buildDir)
}
