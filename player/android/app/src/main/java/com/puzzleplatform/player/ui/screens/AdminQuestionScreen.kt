package com.puzzleplatform.player.ui.screens

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.MenuAnchorType
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import coil.compose.AsyncImage
import com.puzzleplatform.player.puzzle.SudokuAuthoring
import com.puzzleplatform.player.ui.DIFFICULTY_LABELS
import com.puzzleplatform.player.ui.board.DigitBar
import com.puzzleplatform.player.ui.board.SudokuBoard

/**
 * Create a single sudoku question from an album photo (the pilot for in-app
 * authoring). Flow: pick image → Parse (OCR) → review/fix the 9×9 on the real
 * player board → set metadata → Create, which runs the server's per-question
 * solver gate. No ZIP, no batch, no all-or-nothing.
 */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun AdminQuestionScreen(
    onBack: () -> Unit,
    vm: AdminQuestionViewModel = viewModel(),
) {
    val state by vm.state.collectAsStateWithLifecycle()
    // The review board reuses the player SudokuBoard verbatim; an all-zero-hints
    // puzzle keeps every cell editable (parsed givens ride in as userValues).
    val reviewPuzzle = remember { SudokuAuthoring.blankPuzzle() }

    val picker = rememberLauncherForActivityResult(
        ActivityResultContracts.PickVisualMedia()
    ) { uri -> vm.setImage(uri) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Create question (Sudoku)") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
            )
        },
    ) { padding ->
        Column(
            Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(16.dp)
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            // 1. Pick an album image.
            OutlinedButton(
                onClick = {
                    picker.launch(
                        PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)
                    )
                },
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text(if (state.imageUri == null) "Pick image from album" else "Pick a different image")
            }

            state.imageUri?.let { uri ->
                AsyncImage(
                    model = uri,
                    contentDescription = "Selected puzzle image",
                    contentScale = ContentScale.Fit,
                    modifier = Modifier.fillMaxWidth().heightIn(max = 260.dp),
                )

                // 2. Parse. Disabled with guidance when no parser URL is configured.
                Button(
                    onClick = vm::parse,
                    enabled = state.parserConfigured && !state.parsing,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    if (state.parsing) {
                        CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp)
                    } else {
                        Text(if (state.parsed) "Re-parse image" else "Parse image")
                    }
                }
                if (!state.parserConfigured) {
                    Text(
                        "No parser URL configured — set PARSER_URL to enable OCR.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                if (state.parsing) {
                    Text(
                        "Parsing… a cold parser can take up to a minute.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }

            // 3. Review/edit the parsed grid, then metadata + Create.
            if (state.parsed) {
                Text(
                    "Review the grid — tap a cell to fix a mis-read digit. Conflicts show in red.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                SudokuBoard(
                    puzzle = reviewPuzzle,
                    userValues = state.userValues,
                    liveValidate = true,
                    selectedCell = state.selectedCell,
                    onSelectCell = vm::selectCell,
                )
                if (state.selectedCell != null) {
                    DigitBar(
                        onDigit = vm::enterDigit,
                        onClear = vm::clearCell,
                        onDismiss = { vm.selectCell(null) },
                    )
                }

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

                CollectionDropdown(
                    collections = state.collections,
                    selectedId = state.srcCollectionId,
                    onSelect = vm::setSrcCollection,
                )

                Button(
                    onClick = vm::submit,
                    enabled = !state.submitting,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    if (state.submitting) {
                        CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp)
                    } else {
                        Text("Create")
                    }
                }
            }

            state.error?.let {
                Text("Error: $it", color = MaterialTheme.colorScheme.error)
            }
            state.createdId?.let {
                Text("Created question $it.", color = MaterialTheme.colorScheme.primary)
            }
        }
    }
}

/**
 * Optional source-collection picker. "None" leaves the puzzle uncollected (the
 * common case for a quick one-off), matching the web admin's optional field.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun CollectionDropdown(
    collections: List<com.puzzleplatform.player.data.model.Collection>,
    selectedId: Int?,
    onSelect: (Int?) -> Unit,
) {
    var expanded by remember { mutableStateOf(false) }
    val selectedName = collections.firstOrNull { it.id == selectedId }?.name ?: "None"

    ExposedDropdownMenuBox(
        expanded = expanded,
        onExpandedChange = { expanded = it },
    ) {
        OutlinedTextField(
            value = selectedName,
            onValueChange = {},
            readOnly = true,
            label = { Text("Source collection") },
            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = expanded) },
            modifier = Modifier
                .fillMaxWidth()
                .menuAnchor(MenuAnchorType.PrimaryNotEditable),
        )
        ExposedDropdownMenu(
            expanded = expanded,
            onDismissRequest = { expanded = false },
        ) {
            DropdownMenuItem(
                text = { Text("None") },
                onClick = { onSelect(null); expanded = false },
            )
            for (c in collections) {
                DropdownMenuItem(
                    text = { Text(c.name) },
                    onClick = { onSelect(c.id); expanded = false },
                )
            }
        }
    }
}
