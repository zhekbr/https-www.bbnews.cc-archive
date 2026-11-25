          provider: enResult.provider,
          hasImage: Boolean(imgPostUrl),
          hasReel: Boolean(reelVideoUrl),
          postedSocial,
          postedChannels,
        });
        // Register both the generated headline and raw RSS title so later candidates in this same run are deduplicated
        recentHeadlines48h.unshift(cleanEnHeadline, item.title);
      } catch (err) {
        stats.publishErrors.push(`Publish (${item.title.slice(0, 40)}): ${err.message}`);
        console.error(`❌ [Publish] Failed for "${item.title}": ${err.message}`);
      }
    }
  } finally {
    if (imageRenderer) {
      await imageRenderer.close();
    }
  }
  // Detect real system failures so GitHub Actions marks the run red (❌) and emails the owner
  const allAnalyzersFailed = freshCandidates.length > 0 && stats.analyzerSuccess === 0 && stats.analyzerErrors.length > 0;
  const allPublishesFailed = stats.publishAttempted > 0 && publishedCount === 0 && stats.publishErrors.length > 0;
  stats.fatalFailure = allAnalyzersFailed || allPublishesFailed;
  writeGitHubStepSummary(stats);
  console.log(`🏁 [BBN Pipeline] Done. Published ${publishedCount} breaking news article(s).`);
  if (stats.fatalFailure) {
    throw new Error(
      allAnalyzersFailed
        ? `All Groq analyzer calls failed (${stats.analyzerErrors.length} errors)`
        : `All article publish attempts failed (${stats.publishErrors.length} errors)`
    );
  }
}
main().catch((err) => {
  console.error('💥 [BBN Pipeline] Fatal error:', err);
  process.exit(1);
});
