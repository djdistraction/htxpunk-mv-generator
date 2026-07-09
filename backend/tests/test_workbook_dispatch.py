"""
Regression test for a real bug: two near-simultaneous requests to the same
workbook manual-action endpoint (double-click, two open tabs, a client
retry) used to both pass the stage-gate check and both start the worker
concurrently, before the in-flight guard was added. Confirmed real via this
exact reproduction; keeping it as a permanent test so the guard can't
silently regress.
"""
import threading
import time
import uuid

from database import db_create_project, db_update_project
from services.workbook_status import set_section_status
from workers import pipeline_worker


def test_concurrent_requests_do_not_double_dispatch(client):
    project_id = str(uuid.uuid4())
    db_create_project(project_id, "Race Test", "Artist")
    db_update_project(project_id, stage="analyzed", analysis={"themes": ["test"]})
    # Realistic pre-state: a real project reaches "generate-treatment" only
    # after song_analysis is approved. Leaving section_statuses empty here
    # would race PR #31's required-upstream-sections check against the
    # in-flight guard itself (the first winning request's own "running"
    # write flips section-gating on for the second request), which is a
    # separate, real design question about legacy vs. gated projects — not
    # what this test is verifying. Approving upstream first isolates the
    # double-dispatch guard as the only thing under test.
    set_section_status(project_id, "song_analysis", "approved", message="test setup")

    call_count = {"n": 0}
    original = pipeline_worker.run_treatment_generation

    def slow_fake(pid):
        call_count["n"] += 1
        time.sleep(0.5)

    pipeline_worker.run_treatment_generation = slow_fake
    try:
        results = []

        def fire():
            r = client.post(f"/api/pipeline/{project_id}/generate-treatment")
            results.append(r.status_code)

        t1 = threading.Thread(target=fire)
        t2 = threading.Thread(target=fire)
        t1.start()
        time.sleep(0.05)
        t2.start()
        t1.join()
        t2.join()
        time.sleep(0.8)  # let the winning background thread finish

        assert sorted(results) == [200, 409], (
            f"expected exactly one 200 and one 409, got {results}"
        )
        assert call_count["n"] == 1, (
            f"expected exactly one worker invocation, got {call_count['n']}"
        )
    finally:
        pipeline_worker.run_treatment_generation = original
