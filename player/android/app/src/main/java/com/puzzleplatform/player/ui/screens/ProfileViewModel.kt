package com.puzzleplatform.player.ui.screens

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.puzzleplatform.player.data.PuzzleRepository
import com.puzzleplatform.player.data.ServiceLocator
import com.puzzleplatform.player.data.model.Mission
import com.puzzleplatform.player.data.model.ProfileAchievement
import com.puzzleplatform.player.data.model.ProfileCollectionRow
import com.puzzleplatform.player.data.model.ProfileQuestionStat
import com.puzzleplatform.player.data.sync.SyncManager
import com.puzzleplatform.player.data.sync.SyncState
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.ZoneId

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
    /** null while loading; missions load on their own so a failure doesn't hide the profile. */
    val missions: List<Mission>? = null,
    val missionsError: String? = null,
    val syncState: SyncState = SyncState(),
    /** Activity heat map: date -> puzzle type id -> solves; null until loaded. */
    val historyDays: Map<LocalDate, Map<Int, Int>>? = null,
    val historyError: String? = null,
    val today: LocalDate = LocalDate.now(),
)

class ProfileViewModel(
    private val repo: PuzzleRepository = ServiceLocator.repository,
    private val syncManager: SyncManager = ServiceLocator.syncManager,
) : ViewModel() {

    private val _state = MutableStateFlow(ProfileUiState())
    val state: StateFlow<ProfileUiState> = _state.asStateFlow()

    init {
        load()
        observeSync()
    }

    private fun observeSync() {
        viewModelScope.launch {
            syncManager.syncState.collect { s ->
                _state.update { it.copy(syncState = s) }
            }
        }
    }

    fun load() {
        _state.update { it.copy(loading = true, error = null, missions = null, missionsError = null) }
        loadHistory()
        viewModelScope.launch {
            try {
                val missions = repo.getMissions()
                _state.update { it.copy(missions = missions) }
            } catch (e: Exception) {
                _state.update { it.copy(missionsError = e.message ?: "Failed to load missions") }
            }
        }
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

    /** The heat map's year of solves, fetched alongside the profile, in the device's time zone. */
    private fun loadHistory() {
        val tz = ZoneId.systemDefault()
        val today = LocalDate.now(tz)
        _state.update { it.copy(today = today, historyError = null) }
        viewModelScope.launch {
            try {
                val from = ActivityCalendar.rangeStart(today)
                val res = repo.getHistory(from.toString(), today.toString(), tz.id)
                _state.update { it.copy(historyDays = ActivityCalendar.parseDays(res.days)) }
            } catch (e: Exception) {
                _state.update { it.copy(historyError = e.message ?: "Failed to load activity") }
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
