package com.puzzleplatform.player.ui.screens

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.puzzleplatform.player.data.AdminRepository
import com.puzzleplatform.player.data.ServiceLocator
import com.puzzleplatform.player.data.model.Collection
import com.puzzleplatform.player.data.model.UpdateCollectionRequest
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class AdminCollectionEditUiState(
    val loading: Boolean = true,
    val collections: List<Collection> = emptyList(),
    val loadError: String? = null,
    // The picked collection; null until one is chosen.
    val selectedId: Int? = null,
    val name: String = "",
    val publisher: String = "",
    // Plain YYYY-MM-DD text, as on the create screen.
    val publishAt: String = "",
    val coverSrc: String = "",
    val sealed: Boolean = false,
    val saving: Boolean = false,
    val error: String? = null,
    // Set once the server accepts the edit.
    val saved: Boolean = false,
)

/**
 * Edit a collection: pick one, change any property, Done saves. Android twin of the
 * web admin's EditCollectionForm. Sealed is set only here: a sealed collection drops
 * out of every create / move-to picker ([CollectionDropdown]) and the API refuses
 * puzzles into it.
 */
class AdminCollectionEditViewModel(
    private val repo: AdminRepository = ServiceLocator.adminRepository,
) : ViewModel() {

    private val _state = MutableStateFlow(AdminCollectionEditUiState())
    val state: StateFlow<AdminCollectionEditUiState> = _state.asStateFlow()

    init {
        viewModelScope.launch {
            try {
                val collections = repo.listCollections()
                _state.update { it.copy(loading = false, collections = collections) }
            } catch (e: Exception) {
                _state.update { it.copy(loading = false, loadError = repo.serverMessage(e)) }
            }
        }
    }

    fun select(id: Int) {
        val c = _state.value.collections.firstOrNull { it.id == id } ?: return
        _state.update {
            it.copy(
                selectedId = c.id,
                name = c.name,
                publisher = c.publisher.orEmpty(),
                publishAt = c.publishAt?.take(10).orEmpty(),
                coverSrc = c.coverSrc.orEmpty(),
                sealed = c.sealed,
                error = null,
                saved = false,
            )
        }
    }

    fun setName(v: String) = _state.update { it.copy(name = v, error = null, saved = false) }
    fun setPublisher(v: String) = _state.update { it.copy(publisher = v, saved = false) }
    fun setPublishAt(v: String) = _state.update { it.copy(publishAt = v, saved = false) }
    fun setCoverSrc(v: String) = _state.update { it.copy(coverSrc = v, saved = false) }
    fun setSealed(v: Boolean) = _state.update { it.copy(sealed = v, saved = false) }

    /** Save every field; blank optional ones are cleared. Name is required. */
    fun save() {
        val s = _state.value
        val id = s.selectedId ?: return
        if (s.saving) return
        if (s.name.isBlank()) {
            _state.update { it.copy(error = "Name is required") }
            return
        }
        _state.update { it.copy(saving = true, error = null, saved = false) }
        viewModelScope.launch {
            try {
                val updated = repo.updateCollection(
                    id,
                    UpdateCollectionRequest(
                        name = s.name.trim(),
                        publisher = s.publisher.trim().ifBlank { null },
                        publishAt = s.publishAt.trim().ifBlank { null },
                        coverSrc = s.coverSrc.trim().ifBlank { null },
                        sealed = s.sealed,
                    )
                )
                _state.update { st ->
                    st.copy(
                        saving = false,
                        saved = true,
                        collections = st.collections.map { if (it.id == id) updated else it },
                    )
                }
            } catch (e: Exception) {
                _state.update { it.copy(saving = false, error = repo.serverMessage(e)) }
            }
        }
    }
}
