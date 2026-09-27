package com.puzzleplatform.player

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Surface
import androidx.compose.ui.Modifier
import com.puzzleplatform.player.ui.PuzzleApp
import com.puzzleplatform.player.ui.theme.PuzzlePlayerTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            PuzzlePlayerTheme {
                Surface(modifier = Modifier.fillMaxSize()) {
                    PuzzleApp()
                }
            }
        }
    }
}
