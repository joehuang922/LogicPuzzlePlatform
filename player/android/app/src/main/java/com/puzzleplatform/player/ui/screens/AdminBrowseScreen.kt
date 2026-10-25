package com.puzzleplatform.player.ui.screens

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.puzzleplatform.player.data.model.Collection
import com.puzzleplatform.player.data.model.Puzzle
import com.puzzleplatform.player.ui.DIFFICULTY_LABELS

/**
 * Browse collections and pick a question to edit, like the web admin's collection
 * browser. Tap a collection to list its questions; tap a question to open
 * [AdminPuzzleEditScreen]. Questions the solver gate flagged carry a red badge.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AdminBrowseScreen(
    onBack: () -> Unit,
    onEditPuzzle: (puzzleId: String) -> Unit,
    vm: AdminBrowseViewModel = viewModel(),
) {
    val state by vm.state.collectAsStateWithLifecycle()

    // Coming back from the editor: re-read counts and the open list so a save or
    // delete shows. Also fires on first composition, which the VM skips mid-load.
    LifecycleEventEffect(Lifecycle.Event.ON_RESUME) { vm.refresh() }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Edit questions") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
            )
        },
    ) { padding ->
        when {
            state.loading -> Column(
                Modifier.fillMaxSize().padding(padding),
                verticalArrangement = Arrangement.Center,
                horizontalAlignment = Alignment.CenterHorizontally,
            ) { CircularProgressIndicator() }
            state.error != null && state.collections.isEmpty() -> Column(
                Modifier.fillMaxSize().padding(padding),
                verticalArrangement = Arrangement.Center,
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Text("Error: ${state.error}", color = MaterialTheme.colorScheme.error)
                TextButton(onClick = vm::load) { Text("Retry") }
            }
            else -> LazyColumn(
                modifier = Modifier.fillMaxSize().padding(padding).padding(horizontal = 12.dp),
                verticalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                item {
                    Text(
                        "Tap a collection to list its questions, then a question to edit its board " +
                            "and details.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(vertical = 8.dp),
                    )
                }
                items(state.collections, key = { "col-${it.id}" }) { c ->
                    BrowseCollectionRow(
                        collection = c,
                        expanded = state.expandedId == c.id,
                        onToggle = { vm.toggle(c.id) },
                    )
                    if (state.expandedId == c.id) {
                        when {
                            state.loadingPuzzles -> Text(
                                "Loading questions…",
                                modifier = Modifier.padding(start = 16.dp, bottom = 8.dp),
                            )
                            state.puzzlesError != null -> Text(
                                "Error: ${state.puzzlesError}",
                                color = MaterialTheme.colorScheme.error,
                                modifier = Modifier.padding(start = 16.dp, bottom = 8.dp),
                            )
                            state.puzzles.isEmpty() -> Text(
                                "No questions in this collection.",
                                style = MaterialTheme.typography.bodySmall,
                                modifier = Modifier.padding(start = 16.dp, bottom = 8.dp),
                            )
                            else -> {
                                for (p in state.puzzles) {
                                    BrowsePuzzleRow(puzzle = p, onClick = { onEditPuzzle(p.id) })
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun BrowseCollectionRow(collection: Collection, expanded: Boolean, onToggle: () -> Unit) {
    Card(modifier = Modifier.fillMaxWidth().clickable(onClick = onToggle)) {
        Row(
            Modifier.padding(12.dp).fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(Modifier.weight(1f)) {
                Text((if (expanded) "▾ " else "▸ ") + collection.name, fontWeight = FontWeight.Medium)
                collection.publisher?.let {
                    Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            Text("${collection.puzzleCount}", style = MaterialTheme.typography.bodySmall)
        }
    }
}

@Composable
private fun BrowsePuzzleRow(puzzle: Puzzle, onClick: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(start = 20.dp, top = 6.dp, bottom = 6.dp, end = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(puzzle.title ?: "(none)", style = MaterialTheme.typography.bodyMedium)
                validationLabel(puzzle.validationStatus)?.let {
                    Spacer(Modifier.width(6.dp))
                    ValidationBadge(it)
                }
            }
            val diff = DIFFICULTY_LABELS[puzzle.difficulty] ?: puzzle.difficulty
            val size = puzzle.width?.let { w -> puzzle.height?.let { h -> " · $w x $h" } } ?: ""
            val author = puzzle.author?.let { " · $it" } ?: ""
            Text(
                "${puzzle.puzzleTypeJpLabel} · $diff$size$author",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        Icon(
            Icons.Filled.Edit,
            contentDescription = "Edit",
            tint = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

/** A small red chip for a gate verdict that needs editorial review. */
@Composable
fun ValidationBadge(label: String) {
    Surface(
        color = MaterialTheme.colorScheme.errorContainer,
        contentColor = MaterialTheme.colorScheme.onErrorContainer,
        shape = RoundedCornerShape(4.dp),
    ) {
        Text(
            label,
            style = MaterialTheme.typography.labelSmall,
            modifier = Modifier.padding(horizontal = 6.dp, vertical = 1.dp),
        )
    }
}

/**
 * The badge text for a flagged gate verdict, matching the web admin's ValidationBadge;
 * null for "unique" and unclassified questions, which show nothing.
 */
fun validationLabel(status: String?): String? = when (status) {
    "none" -> "No solution"
    "multiple" -> "Multiple solutions"
    "unknown" -> "Unsolved (timed out)"
    else -> null
}
