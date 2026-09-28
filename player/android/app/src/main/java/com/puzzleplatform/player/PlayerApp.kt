package com.puzzleplatform.player

import android.app.Application
import com.puzzleplatform.player.data.ServiceLocator

class PlayerApp : Application() {
    override fun onCreate() {
        super.onCreate()
        // Wire the Context-dependent singletons (Room, WorkManager, sync) once.
        ServiceLocator.init(this)
    }
}
