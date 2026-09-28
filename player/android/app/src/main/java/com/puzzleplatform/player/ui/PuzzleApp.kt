package com.puzzleplatform.player.ui

import androidx.compose.runtime.Composable
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.puzzleplatform.player.ui.screens.HomeScreen
import com.puzzleplatform.player.ui.screens.PlayScreen
import com.puzzleplatform.player.ui.screens.ProfileScreen

object Routes {
    const val HOME = "home"
    const val PROFILE = "profile"
    // play/{puzzleId}?attempt={attemptId}
    const val PLAY = "play/{puzzleId}?attempt={attemptId}"

    fun play(puzzleId: String, attemptId: String) = "play/$puzzleId?attempt=$attemptId"
}

@Composable
fun PuzzleApp() {
    val navController = rememberNavController()

    NavHost(navController = navController, startDestination = Routes.HOME) {
        composable(Routes.HOME) {
            HomeScreen(
                onOpenAttempt = { puzzleId, attemptId ->
                    navController.navigate(Routes.play(puzzleId, attemptId))
                },
                onOpenProfile = { navController.navigate(Routes.PROFILE) },
            )
        }
        composable(
            route = Routes.PLAY,
            arguments = listOf(
                navArgument("puzzleId") { type = NavType.StringType },
                navArgument("attemptId") { type = NavType.StringType },
            ),
        ) { backStackEntry ->
            val puzzleId = backStackEntry.arguments?.getString("puzzleId").orEmpty()
            val attemptId = backStackEntry.arguments?.getString("attemptId").orEmpty()
            PlayScreen(
                puzzleId = puzzleId,
                attemptId = attemptId,
                onBack = { navController.popBackStack() },
                onOpenAttempt = { pid, aid ->
                    // Replace the current play route so Back doesn't return to the
                    // stale attempt after an opt-in reload of an updated puzzle.
                    navController.navigate(Routes.play(pid, aid)) {
                        popUpTo(Routes.PLAY) { inclusive = true }
                    }
                },
            )
        }
        composable(Routes.PROFILE) {
            ProfileScreen(onBack = { navController.popBackStack() })
        }
    }
}
