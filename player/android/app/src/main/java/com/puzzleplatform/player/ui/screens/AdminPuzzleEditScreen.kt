package com.puzzleplatform.player.ui.screens

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.puzzleplatform.player.data.model.DEFAULT_COLLECTION_ID
import com.puzzleplatform.player.puzzle.QuestionEditRules.SaveGate
import com.puzzleplatform.player.ui.DIFFICULTY_LABELS

/**
 * Edit one existing question, opened from [AdminBrowseScreen]: the board on the
 * type's [BoardDraftEditor] (where Android has one; other types are metadata-only),
 * then title, author, difficulty, collection and the special flag. Save sends the
 * changes and closes; the trash icon soft-deletes the question. Leaving with unsaved
 * changes asks first.
 */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun AdminPuzzleEditScreen(
    puzzleId: String,
    onBack: () -> Unit,
    vm: AdminPuzzleEditViewModel = viewModel(),
) {
    LaunchedEffect(puzzleId) { vm.load(puzzleId) }
    val state by vm.state.collectAsStateWithLifecycle()

    LaunchedEffect(state.done) { if (state.done) onBack() }

    var confirmDiscard by remember { mutableStateOf(false) }
    var confirmDelete by remember { mutableStateOf(false) }
    val leave: () -> Unit = {
        if (state.dirty && !state.done) {
            confirmDiscard = true
        } else {
            onBack()
        }
    }
    BackHandler(onBack = leave)

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Edit question") },
                navigationIcon = {
                    IconButton(onClick = leave) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
                actions = {
                    if (state.puzzle != null) {
                        IconButton(onClick = { confirmDelete = true }, enabled = !state.busy) {
                            Icon(Icons.Filled.Delete, contentDescription = "Delete question")
                        }
                    }
                },
            )
        },
    ) { padding ->
        val puzzle = state.puzzle
        when {
            state.loading -> Column(
                Modifier.fillMaxSize().padding(padding),
                verticalArrangement = Arrangement.Center,
                horizontalAlignment = Alignment.CenterHorizontally,
            ) { CircularProgressIndicator() }
            puzzle == null -> Column(
                Modifier.fillMaxSize().padding(padding),
                verticalArrangement = Arrangement.Center,
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Text("Error: ${state.loadError ?: "Question not found"}", color = MaterialTheme.colorScheme.error)
                TextButton(onClick = vm::retry) { Text("Retry") }
            }
            else -> Column(
                Modifier
                    .fillMaxSize()
                    .padding(padding)
                    .padding(horizontal = 16.dp)
                    .verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(puzzle.puzzleTypeJpLabel, fontWeight = FontWeight.Medium)
                    validationLabel(puzzle.validationStatus)?.let {
                        Spacer(Modifier.width(8.dp))
                        ValidationBadge(it)
                    }
                }

                val type = state.type
                if (type != null) {
                    Text(
                        "Tap a cell to fix the board. A changed board is checked by the solver " +
                            "again when you save.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    BoardDraftEditor(
                        type = type,
                        board = state.board,
                        selectedCell = state.selectedCell,
                        onSelectCell = vm::selectCell,
                        onChange = vm::editBoard,
                    )
                    if (state.boardChanged) {
                        TextButton(onClick = vm::revertBoard, enabled = !state.busy) {
                            Text("Revert board")
                        }
                    }
                } else {
                    Surface(tonalElevation = 1.dp, modifier = Modifier.fillMaxWidth()) {
                        Text(
                            "The ${puzzle.puzzleTypeJpLabel} board can't be edited on Android yet; " +
                                "edit it in the web admin. Its details below can be changed here.",
                            style = MaterialTheme.typography.bodySmall,
                            modifier = Modifier.padding(12.dp),
                        )
                    }
                }

                state.error?.let {
                    Text("Rejected: $it", color = MaterialTheme.colorScheme.error)
                }
                // The solver only timed out on the changed board: save it unverified; it
                // stays flagged for review.
                if (state.gateTimedOut && state.boardChanged) {
                    OutlinedButton(onClick = { vm.save(allowUnverified = true) }, enabled = !state.busy) {
                        Text("Save without solver check")
                    }
                }
                when (state.saveGate) {
                    SaveGate.BLOCKED -> Text(
                        "This board can't be saved until its format problems above are fixed.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.error,
                    )
                    SaveGate.NEEDS_CONFIRM -> Text(
                        "The board has the problems listed above. Save anyway if they're a false alarm.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    SaveGate.READY -> Unit
                }

                HorizontalDivider()

                OutlinedTextField(
                    value = state.title,
                    onValueChange = vm::setTitle,
                    label = { Text("Title") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                OutlinedTextField(
                    value = state.author,
                    onValueChange = vm::setAuthor,
                    label = { Text("Author") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )

                Text("Difficulty", fontWeight = FontWeight.Medium)
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    for (level in 1..5) {
                        FilterChip(
                            selected = state.difficulty == level,
                            onClick = { vm.setDifficulty(level) },
                            label = { Text(DIFFICULTY_LABELS[level] ?: "$level") },
                        )
                    }
                }

                CollectionDropdown(
                    collections = state.collections,
                    selectedId = state.srcCollectionId.takeIf { it != DEFAULT_COLLECTION_ID },
                    onSelect = { vm.setSrcCollection(it ?: DEFAULT_COLLECTION_ID) },
                )

                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("Special", modifier = Modifier.weight(1f))
                    Switch(checked = state.special, onCheckedChange = vm::setSpecial)
                }

                Button(
                    onClick = { vm.save() },
                    enabled = state.dirty && !state.busy && state.saveGate != SaveGate.BLOCKED,
                    modifier = Modifier.fillMaxWidth().padding(bottom = 16.dp),
                ) {
                    when {
                        state.saving -> CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp)
                        state.saveGate == SaveGate.NEEDS_CONFIRM -> Text("Save anyway")
                        else -> Text("Save")
                    }
                }
            }
        }
    }

    if (confirmDiscard) {
        AlertDialog(
            onDismissRequest = { confirmDiscard = false },
            title = { Text("Discard changes?") },
            text = { Text("Your edits to this question haven't been saved.") },
            confirmButton = {
                TextButton(onClick = { confirmDiscard = false; onBack() }) { Text("Discard") }
            },
            dismissButton = {
                TextButton(onClick = { confirmDiscard = false }) { Text("Keep editing") }
            },
        )
    }

    if (confirmDelete) {
        AlertDialog(
            onDismissRequest = { confirmDelete = false },
            title = { Text("Delete question?") },
            text = { Text("\"${state.puzzle?.title ?: "Untitled"}\" will be removed from its collection.") },
            confirmButton = {
                TextButton(onClick = { confirmDelete = false; vm.delete() }) {
                    Text("Delete", color = MaterialTheme.colorScheme.error)
                }
            },
            dismissButton = {
                TextButton(onClick = { confirmDelete = false }) { Text("Cancel") }
            },
        )
    }
}
