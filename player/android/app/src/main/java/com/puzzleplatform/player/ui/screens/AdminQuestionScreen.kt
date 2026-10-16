package com.puzzleplatform.player.ui.screens

import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.MenuAnchorType
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import coil.compose.AsyncImage
import com.puzzleplatform.player.puzzle.ItemStatus
import com.puzzleplatform.player.puzzle.SudokuAuthoring
import com.puzzleplatform.player.ui.DIFFICULTY_LABELS
import com.puzzleplatform.player.ui.board.DigitBar
import com.puzzleplatform.player.ui.board.SudokuBoard
import com.puzzleplatform.player.ui.board.SudokuMiniBoard
import com.puzzleplatform.player.ui.board.ZoomableImage

/**
 * Create one *or many* sudoku questions from album photos (the pilot for in-app
 * authoring). A single pick is just a batch of one — same flow throughout. Steps:
 * pick images → Parse all (OCR each) → review/fix any tile on the real player board
 * (full-screen, with the source photo beside it) → Create all valid, which runs the
 * server's per-question solver gate on each. The create button is re-runnable:
 * created tiles drop out, so fixing a rejected board and pressing again sends only
 * the remainder.
 */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun AdminQuestionScreen(
    onBack: () -> Unit,
    vm: AdminQuestionViewModel = viewModel(),
) {
    val state by vm.state.collectAsStateWithLifecycle()

    // A tile under review takes over the whole screen so the source photo and the
    // board are both visible without a cramped sheet. Same VM, so edits persist.
    val reviewItem = state.reviewItem
    if (reviewItem != null) {
        ReviewScreen(
            item = reviewItem,
            selectedCell = state.selectedCell,
            defaultDifficulty = state.defaultDifficulty,
            onDone = vm::closeReview,
            onSelectCell = vm::selectCell,
            onDigit = vm::enterDigit,
            onClear = vm::clearCell,
            onTitle = { vm.setItemTitle(reviewItem.id, it) },
            onAuthor = { vm.setItemAuthor(reviewItem.id, it) },
            onDifficulty = { vm.setItemDifficulty(reviewItem.id, it) },
            onRemove = { vm.removeItem(reviewItem.id) },
        )
        return
    }

    val picker = rememberLauncherForActivityResult(
        // No-arg = the system's own max-selection limit; avoids the IllegalArgument
        // crash a hardcoded maxItems can hit on devices with a lower limit.
        ActivityResultContracts.PickMultipleVisualMedia()
    ) { uris -> if (uris.isNotEmpty()) vm.setImages(uris) }

    val toParse = state.items.count {
        it.status == ItemStatus.PENDING || it.status == ItemStatus.PARSE_FAILED
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Create question(s) (Sudoku)") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
            )
        },
        bottomBar = {
            if (state.items.isNotEmpty()) {
                CreateFooter(
                    eligibleCount = state.eligibleCount,
                    summary = batchSummary(state),
                    busy = state.creating,
                    enabled = state.eligibleCount > 0 && !state.creating && !state.parsing,
                    onCreate = vm::createAllValid,
                )
            }
        },
    ) { padding ->
        LazyVerticalGrid(
            columns = GridCells.Adaptive(minSize = 120.dp),
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(horizontal = 16.dp),
            contentPadding = PaddingValues(vertical = 16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            // Header: picker + shared controls + parse. Spans the whole width so it
            // scrolls with the tiles below it.
            item(span = { GridItemSpan(maxLineSpan) }) {
                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    OutlinedButton(
                        onClick = {
                            picker.launch(
                                PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)
                            )
                        },
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Text(if (state.items.isEmpty()) "Pick images from album" else "Pick different images")
                    }

                    if (state.items.isEmpty()) {
                        Text(
                            "Pick one or several sudoku photos. Each becomes a tile you can parse, " +
                                "review, and create.",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    } else {
                        // Shared across every tile.
                        CollectionDropdown(
                            collections = state.collections,
                            selectedId = state.srcCollectionId,
                            onSelect = vm::setSrcCollection,
                        )

                        Text("Default difficulty", fontWeight = FontWeight.Medium)
                        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            for (level in 1..5) {
                                FilterChip(
                                    selected = state.defaultDifficulty == level,
                                    onClick = { vm.setDefaultDifficulty(level) },
                                    label = { Text(DIFFICULTY_LABELS[level] ?: "$level") },
                                )
                            }
                        }

                        Button(
                            onClick = vm::parse,
                            enabled = state.parserConfigured && !state.parsing && toParse > 0,
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            if (state.parsing) {
                                CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp)
                            } else {
                                Text(if (toParse > 0) "Parse all ($toParse)" else "All parsed")
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
                        Text(
                            "Tap a tile to review its photo and grid side by side, fix mis-read " +
                                "digits, and set its title.",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }

            items(state.items, key = { it.id }) { item ->
                BatchTile(item = item, onClick = { vm.openReview(item.id) })
            }
        }
    }
}

/** One image in the grid: its mini-board (or picked photo while un-parsed) + a status badge. */
@Composable
private fun BatchTile(item: BatchItem, onClick: () -> Unit) {
    Column(
        modifier = Modifier.clickable(onClick = onClick),
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Box(contentAlignment = Alignment.Center, modifier = Modifier.size(120.dp)) {
            val hasGrid = item.status in GRID_STATUSES
            if (hasGrid) {
                SudokuMiniBoard(givens = item.userValues, size = 120.dp)
            } else {
                AsyncImage(
                    model = item.uri,
                    contentDescription = "Picked puzzle image",
                    contentScale = ContentScale.Crop,
                    modifier = Modifier.size(120.dp),
                )
            }
            if (item.status == ItemStatus.PARSING || item.status == ItemStatus.CREATING) {
                CircularProgressIndicator(Modifier.size(28.dp), strokeWidth = 3.dp)
            }
            StatusBadge(
                item = item,
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .padding(4.dp),
            )
        }
        Text(
            text = tileCaption(item),
            style = MaterialTheme.typography.bodySmall,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
            color = if (item.status == ItemStatus.PARSE_FAILED || item.status == ItemStatus.CREATE_FAILED)
                MaterialTheme.colorScheme.error
            else
                MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
private fun StatusBadge(item: BatchItem, modifier: Modifier = Modifier) {
    val (label, color) = when (item.status) {
        ItemStatus.CREATED -> "✓" to MaterialTheme.colorScheme.primary
        ItemStatus.PARSE_FAILED, ItemStatus.CREATE_FAILED -> "!" to MaterialTheme.colorScheme.error
        ItemStatus.PARSED -> "ready" to MaterialTheme.colorScheme.secondary
        else -> return
    }
    Surface(color = color, shape = RoundedCornerShape(50), modifier = modifier) {
        Text(
            label,
            style = MaterialTheme.typography.labelSmall,
            modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp),
        )
    }
}

/** The create bar pinned to the bottom; summary reflects progress across the batch. */
@Composable
private fun CreateFooter(
    eligibleCount: Int,
    summary: String?,
    busy: Boolean,
    enabled: Boolean,
    onCreate: () -> Unit,
) {
    Surface(tonalElevation = 3.dp) {
        Column(
            Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            if (summary != null) {
                Text(
                    summary,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Button(
                onClick = onCreate,
                enabled = enabled,
                modifier = Modifier.fillMaxWidth(),
            ) {
                if (busy) {
                    CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp)
                } else {
                    Text("Create all valid ($eligibleCount)")
                }
            }
        }
    }
}

/**
 * Full-screen review for a single tile: the zoomable source photo on top (so the user
 * can read the original closely) and the interactive player board below, reused
 * verbatim from the player. A pinned top bar and a bottom button both say Done — every
 * edit is already saved to state as it's typed, so "Done" just returns to the grid.
 */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
private fun ReviewScreen(
    item: BatchItem,
    selectedCell: String?,
    defaultDifficulty: Int,
    onDone: () -> Unit,
    onSelectCell: (String?) -> Unit,
    onDigit: (Int) -> Unit,
    onClear: () -> Unit,
    onTitle: (String) -> Unit,
    onAuthor: (String) -> Unit,
    onDifficulty: (Int?) -> Unit,
    onRemove: () -> Unit,
) {
    // The review board reuses the player SudokuBoard verbatim; an all-zero-hints
    // puzzle keeps every cell editable (parsed givens ride in as userValues).
    val reviewPuzzle = remember { SudokuAuthoring.blankPuzzle() }

    // System back closes the review rather than leaving the authoring screen.
    BackHandler(onBack = onDone)

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Review") },
                navigationIcon = {
                    IconButton(onClick = onDone) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Done")
                    }
                },
                actions = {
                    IconButton(onClick = onRemove) {
                        Icon(Icons.Filled.Delete, contentDescription = "Remove from batch")
                    }
                    TextButton(onClick = onDone) {
                        Icon(Icons.Filled.Check, contentDescription = null)
                        Text("Done")
                    }
                },
            )
        },
    ) { padding ->
        Column(
            Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(horizontal = 16.dp)
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(
                "Compare the photo with the grid — pinch to zoom the photo, tap a cell to fix a " +
                    "mis-read digit. Conflicts show in red.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )

            // Source photo: a 4:3 window the user can pinch/pan to read closely.
            Surface(
                tonalElevation = 1.dp,
                shape = RoundedCornerShape(8.dp),
                modifier = Modifier.fillMaxWidth(),
            ) {
                ZoomableImage(
                    model = item.uri,
                    contentDescription = "Source puzzle photo",
                    modifier = Modifier
                        .fillMaxWidth()
                        .aspectRatio(4f / 3f),
                )
            }

            SudokuBoard(
                puzzle = reviewPuzzle,
                userValues = item.userValues,
                liveValidate = true,
                selectedCell = selectedCell,
                onSelectCell = onSelectCell,
            )
            if (selectedCell != null) {
                DigitBar(
                    onDigit = onDigit,
                    onClear = onClear,
                    onDismiss = { onSelectCell(null) },
                )
            }

            item.error?.let {
                Text("Rejected: $it", color = MaterialTheme.colorScheme.error)
            }

            HorizontalDivider()

            OutlinedTextField(
                value = item.title,
                onValueChange = onTitle,
                label = { Text("Title") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            OutlinedTextField(
                value = item.author,
                onValueChange = onAuthor,
                label = { Text("Author") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )

            Text("Difficulty", fontWeight = FontWeight.Medium)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                FilterChip(
                    selected = item.difficulty == null,
                    onClick = { onDifficulty(null) },
                    label = { Text("Default (${DIFFICULTY_LABELS[defaultDifficulty] ?: defaultDifficulty})") },
                )
                for (level in 1..5) {
                    FilterChip(
                        selected = item.difficulty == level,
                        onClick = { onDifficulty(level) },
                        label = { Text(DIFFICULTY_LABELS[level] ?: "$level") },
                    )
                }
            }

            Button(onClick = onDone, modifier = Modifier.fillMaxWidth()) {
                Text("Done")
            }
        }
    }
}

/**
 * Optional source-collection picker, shared across the batch. "None" leaves the
 * puzzles uncollected (the common case for a quick one-off), matching the web admin's
 * optional field.
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

/** Statuses whose tile shows the parsed mini-board rather than the raw photo. */
private val GRID_STATUSES = setOf(
    ItemStatus.PARSED,
    ItemStatus.CREATING,
    ItemStatus.CREATED,
    ItemStatus.CREATE_FAILED,
)

/** The one-line caption under a tile: its title if set, else its status/error. */
private fun tileCaption(item: BatchItem): String {
    val title = item.title.trim()
    if (title.isNotEmpty()) return title
    return when (item.status) {
        ItemStatus.PENDING -> "Not parsed"
        ItemStatus.PARSING -> "Parsing…"
        ItemStatus.PARSED -> "Ready"
        ItemStatus.PARSE_FAILED -> item.error?.let { "Parse failed: $it" } ?: "Parse failed"
        ItemStatus.CREATING -> "Creating…"
        ItemStatus.CREATED -> item.createdId?.let { "Created #$it" } ?: "Created"
        ItemStatus.CREATE_FAILED -> item.error?.let { "Rejected: $it" } ?: "Rejected"
    }
}

/** "8 created · 1 failed" — null when nothing noteworthy has happened yet. */
private fun batchSummary(state: AdminQuestionUiState): String? {
    val parts = buildList {
        if (state.createdCount > 0) add("${state.createdCount} created")
        if (state.failedCount > 0) add("${state.failedCount} failed")
    }
    return parts.takeIf { it.isNotEmpty() }?.joinToString(" · ")
}
