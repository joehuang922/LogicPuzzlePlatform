package com.puzzleplatform.player.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

/**
 * Admin hub: entry point for in-app authoring. Links to create a collection, create
 * questions (sudoku, nonogram, kakuro, slitherlink, nurikabe, heyawake, picto link,
 * yajilin, ripple effect, masyu, slalom, shakashaka, akari, number link, shikaku) from
 * photos, and browse collections to edit or delete existing questions. A plain,
 * unguarded route (the API has no auth), reached from the always-visible build
 * icon in the Home top bar.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AdminScreen(
    onBack: () -> Unit,
    onCreateCollection: () -> Unit,
    onCreateQuestion: () -> Unit,
    onEditQuestions: () -> Unit,
) {
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Admin") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
            )
        },
    ) { padding ->
        Column(
            Modifier.fillMaxSize().padding(padding).padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(
                "Create and edit puzzle content directly on the device. Each question's board " +
                    "is validated by the server as you create or change it.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Button(onClick = onCreateCollection, modifier = Modifier.fillMaxWidth()) {
                Text("Create collection")
            }
            Button(onClick = onCreateQuestion, modifier = Modifier.fillMaxWidth()) {
                Text("Create question(s)")
            }
            Button(onClick = onEditQuestions, modifier = Modifier.fillMaxWidth()) {
                Text("Edit questions")
            }
        }
    }
}
