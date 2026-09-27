package com.puzzleplatform.player.ui.screens

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.puzzleplatform.player.data.PuzzleRepository
import com.puzzleplatform.player.data.ServiceLocator
import com.puzzleplatform.player.data.model.ProfileAchievement
import com.puzzleplatform.player.data.model.ProfileCollectionRow
import com.puzzleplatform.player.data.model.ProfileQuestionStat
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class CollectionGroup(
    val collectionId: Int,
    val collectionName: String,
    val totalSolved: Int,
    val totalCount: Int,
    val types: List<TypeStat>,
) {
    data class TypeStat(val typeJpLabel: String, val solved: Int, val total: Int)
}

data class ProfileUiState(
    val loading: Boolean = true,
    val error: String? = null,
    val playerName: String = "",
    val questionStats: List<ProfileQuestionStat> = emptyList(),
    val collectionGroups: List<CollectionGroup> = emptyList(),
    val achievements: List<ProfileAchievement> = emptyList(),
)

class ProfileViewModel(
    private val repo: PuzzleRepository = ServiceLocator.repository,
) : ViewModel() {

    private val _state = MutableStateFlow(ProfileUiState())
    val state: StateFlow<ProfileUiState> = _state.asStateFlow()

    init { load() }

    fun load() {
        _state.update { it.copy(loading = true, error = null) }
        viewModelScope.launch {
            try {
                val profile = repo.getProfile()
                _state.update {
                    it.copy(
                        loading = false,
                        playerName = profile.player.name,
                        questionStats = profile.questionStats,
                        collectionGroups = groupCollectionStats(profile.collectionStats),
                        achievements = profile.achievements,
                    )
                }
            } catch (e: Exception) {
                _state.update { it.copy(loading = false, error = e.message ?: "Failed to load profile") }
            }
        }
    }

    private fun groupCollectionStats(rows: List<ProfileCollectionRow>): List<CollectionGroup> {
        val map = LinkedHashMap<Int, MutableList<ProfileCollectionRow>>()
        for (row in rows) map.getOrPut(row.collectionId) { mutableListOf() }.add(row)
        return map.map { (_, group) ->
            CollectionGroup(
                collectionId = group.first().collectionId,
                collectionName = group.first().collectionName,
                totalSolved = group.sumOf { it.solved },
                totalCount = group.sumOf { it.total },
                types = group.map { CollectionGroup.TypeStat(it.typeJpLabel, it.solved, it.total) },
            )
        }
    }
}
