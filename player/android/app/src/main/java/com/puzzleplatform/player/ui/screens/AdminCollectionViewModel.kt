package com.puzzleplatform.player.ui.screens

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.puzzleplatform.player.data.AdminRepository
import com.puzzleplatform.player.data.ServiceLocator
import com.puzzleplatform.player.data.model.CreateCollectionRequest
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class AdminCollectionUiState(
    val name: String = "",
    val publisher: String = "",
    // Plain YYYY-MM-DD text; the API stores it as the publish date.
    val publishAt: String = "",
    val coverSrc: String = "",
    val submitting: Boolean = false,
    val error: String? = null,
    // Set once the server accepts the collection; the screen shows the new id.
    val createdId: Int? = null,
)

class AdminCollectionViewModel(
    private val repo: AdminRepository = ServiceLocator.adminRepository,
) : ViewModel() {

    private val _state = MutableStateFlow(AdminCollectionUiState())
    val state: StateFlow<AdminCollectionUiState> = _state.asStateFlow()

    fun setName(v: String) = _state.update { it.copy(name = v, error = null) }
    fun setPublisher(v: String) = _state.update { it.copy(publisher = v) }
    fun setPublishAt(v: String) = _state.update { it.copy(publishAt = v) }
    fun setCoverSrc(v: String) = _state.update { it.copy(coverSrc = v) }

    /** Create the collection. Name is required; blank optional fields are sent as null. */
    fun submit() {
        val s = _state.value
        if (s.submitting) return
        if (s.name.isBlank()) {
            _state.update { it.copy(error = "Name is required") }
            return
        }
        _state.update { it.copy(submitting = true, error = null, createdId = null) }
        viewModelScope.launch {
            try {
                val id = repo.createCollection(
                    CreateCollectionRequest(
                        name = s.name.trim(),
                        publisher = s.publisher.trim().ifBlank { null },
                        publishAt = s.publishAt.trim().ifBlank { null },
                        coverSrc = s.coverSrc.trim().ifBlank { null },
                    )
                )
                _state.update { it.copy(submitting = false, createdId = id) }
            } catch (e: Exception) {
                _state.update { it.copy(submitting = false, error = repo.serverMessage(e)) }
            }
        }
    }
}
