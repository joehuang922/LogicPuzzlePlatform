package com.puzzleplatform.player.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
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
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MenuAnchorType
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import coil.compose.AsyncImage
import com.puzzleplatform.player.data.model.Collection
import com.puzzleplatform.player.puzzle.TitleNormalize

/**
 * Edit a collection: pick one from the list, then every property (cover by URL, with a
 * preview) and the admin-only Sealed switch. Done saves. Twin of the web admin's
 * EditCollectionForm.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AdminCollectionEditScreen(
    onBack: () -> Unit,
    vm: AdminCollectionEditViewModel = viewModel(),
) {
    val state by vm.state.collectAsStateWithLifecycle()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Edit collection") },
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
            when {
                state.loading -> CircularProgressIndicator()
                state.loadError != null ->
                    Text("Error: ${state.loadError}", color = MaterialTheme.colorScheme.error)
                else -> CollectionPicker(
                    collections = state.collections,
                    selectedId = state.selectedId,
                    onSelect = vm::select,
                )
            }

            if (state.selectedId != null) {
                OutlinedTextField(
                    value = state.name,
                    onValueChange = vm::setName,
                    label = { Text("Name *") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                OutlinedTextField(
                    value = state.publisher,
                    onValueChange = vm::setPublisher,
                    label = { Text("Publisher") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                OutlinedTextField(
                    value = state.publishAt,
                    onValueChange = vm::setPublishAt,
                    label = { Text("Publish date (YYYY-MM-DD)") },
                    placeholder = { Text("2026-01-31") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                OutlinedTextField(
                    value = state.coverSrc,
                    onValueChange = vm::setCoverSrc,
                    label = { Text("Cover image URL") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                if (state.coverSrc.isNotBlank()) {
                    AsyncImage(
                        model = state.coverSrc.trim(),
                        contentDescription = "Cover preview",
                        modifier = Modifier.widthIn(max = 120.dp).heightIn(max = 160.dp),
                    )
                }
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text("Sealed")
                        Text(
                            "No new puzzles: hidden from create and move-to pickers.",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    Switch(checked = state.sealed, onCheckedChange = vm::setSealed)
                }

                Button(
                    onClick = vm::save,
                    enabled = !state.saving && state.name.isNotBlank(),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    if (state.saving) {
                        CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp)
                    } else {
                        Text("Done")
                    }
                }

                state.error?.let {
                    Text("Error: $it", color = MaterialTheme.colorScheme.error)
                }
                if (state.saved) {
                    Text("Saved.", color = MaterialTheme.colorScheme.primary)
                }

                HorizontalDivider()
                val normalizer = state.normalizer
                if (normalizer == null) {
                    OutlinedButton(onClick = vm::openNormalizer) { Text("Normalize titles") }
                } else {
                    TitleNormalizerPanel(
                        state = normalizer,
                        onPatternChange = vm::setNormalizerPattern,
                        onApply = vm::applyNormalizer,
                        onClose = vm::closeNormalizer,
                    )
                }
            }
        }
    }
}

/** Every collection, sealed ones marked; picking one loads it into the form. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun CollectionPicker(
    collections: List<Collection>,
    selectedId: Int?,
    onSelect: (Int) -> Unit,
) {
    var expanded by remember { mutableStateOf(false) }
    fun label(c: Collection) = buildString {
        c.publisher?.takeIf { it.isNotBlank() }?.let { append(it).append(" · ") }
        append(c.name)
        if (c.sealed) append(" (sealed)")
    }
    val selected = collections.firstOrNull { it.id == selectedId }

    ExposedDropdownMenuBox(expanded = expanded, onExpandedChange = { expanded = it }) {
        OutlinedTextField(
            value = selected?.let { label(it) } ?: "",
            onValueChange = {},
            readOnly = true,
            label = { Text("Collection") },
            placeholder = { Text("Pick a collection") },
            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = expanded) },
            modifier = Modifier
                .fillMaxWidth()
                .menuAnchor(MenuAnchorType.PrimaryNotEditable),
        )
        ExposedDropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
            for (c in collections) {
                DropdownMenuItem(
                    text = { Text(label(c)) },
                    onClick = { onSelect(c.id); expanded = false },
                )
            }
        }
    }
}

/**
 * Rewrite the collection's numbered titles to one pattern with zero-padded numbers,
 * previewing every rename first. Twin of the web admin's TitleNormalizer.
 */
@Composable
private fun TitleNormalizerPanel(
    state: TitleNormalizerState,
    onPatternChange: (String) -> Unit,
    onApply: () -> Unit,
    onClose: () -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text("Normalize titles", style = MaterialTheme.typography.titleMedium)
        if (state.puzzles == null) {
            CircularProgressIndicator()
            return@Column
        }
        val patternError = state.patternError
        OutlinedTextField(
            value = state.pattern,
            onValueChange = onPatternChange,
            label = { Text("Pattern") },
            singleLine = true,
            isError = patternError != null,
            supportingText = {
                Text(
                    patternError ?: "${TitleNormalize.NUMBER_TOKEN} is the title's first number, zero-padded " +
                        "to the widest one; ${TitleNormalize.TEXT_TOKEN} is what follows it. Titles without " +
                        "a number are left alone."
                )
            },
            modifier = Modifier.fillMaxWidth(),
        )
        val changes = state.changes
        val renames = changes.count { it.renamed }
        val conflicts = changes.any { it.conflict }
        val typeLabel = state.puzzles.associate { it.id to it.puzzleTypeJpLabel }
        if (patternError == null) {
            if (renames == 0) {
                Text(
                    "All titles already match.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            for (c in changes) {
                if (!c.renamed && !c.conflict) continue
                val color = if (c.conflict) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurface
                Column {
                    Text(
                        typeLabel[c.id].orEmpty(),
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Text(
                        "${c.oldTitle ?: "(none)"}  →  ${c.newTitle ?: "(none)"}" +
                            if (c.conflict) "  (duplicate)" else "",
                        style = MaterialTheme.typography.bodyMedium,
                        color = color,
                    )
                }
            }
        }
        if (conflicts) {
            Text(
                "Some questions of the same type would share a title. Change the pattern or fix those titles first.",
                color = MaterialTheme.colorScheme.error,
            )
        }
        state.error?.let { Text("Error: $it", color = MaterialTheme.colorScheme.error) }
        state.message?.let { Text(it, color = MaterialTheme.colorScheme.primary) }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Button(
                onClick = onApply,
                enabled = !state.applying && patternError == null && renames > 0 && !conflicts,
            ) {
                if (state.applying) {
                    CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp)
                } else {
                    Text("Rename $renames")
                }
            }
            OutlinedButton(onClick = onClose, enabled = !state.applying) { Text("Close") }
        }
    }
}
