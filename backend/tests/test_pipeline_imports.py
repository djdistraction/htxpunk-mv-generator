"""
Catches the class of bug that has already shipped to main before: a syntax
error, a bad import, or a STAGE_WORKERS/manual-dispatch entry pointing at a
function that doesn't exist on pipeline_worker. Nothing in this repo caught
that automatically until this file existed — every prior instance was found
by hand, after the fact.
"""
import importlib


def test_core_modules_import_cleanly():
    for module_name in [
        "main",
        "config",
        "database",
        "orchestrator",
        "api.projects",
        "api.pipeline",
        "api.assets",
        "api.settings",
        "workers.pipeline_worker",
    ]:
        importlib.import_module(module_name)


def test_orchestrator_stage_workers_reference_real_functions():
    import orchestrator
    from workers import pipeline_worker

    for stage, worker_name in orchestrator.STAGE_WORKERS.items():
        assert hasattr(pipeline_worker, worker_name), (
            f"STAGE_WORKERS['{stage}'] = '{worker_name}' but "
            f"pipeline_worker has no such function"
        )


def test_task_type_to_stage_is_consistent_with_stage_workers():
    import orchestrator

    # TASK_TYPE_TO_STAGE is intentionally broader than STAGE_WORKERS (manual
    # workbook stages included), but every STAGE_WORKERS entry must still
    # round-trip through it — that's what /retry relies on to resume a
    # crashed project at the right stage.
    reverse = {v: k for k, v in orchestrator.STAGE_WORKERS.items()}
    for task_type, stage in reverse.items():
        assert orchestrator.TASK_TYPE_TO_STAGE.get(task_type) == stage


def test_manual_worker_endpoints_reference_real_functions():
    """api/pipeline.py's _start_manual_worker calls getattr(pipeline_worker,
    worker_name) at request time — a typo'd worker_name would only surface
    as a 500 the first time a real user clicks the button. Catch it here."""
    import inspect
    from api import pipeline as pipeline_api
    from workers import pipeline_worker

    source = inspect.getsource(pipeline_api)
    # Every _start_manual_worker(project_id, "worker_name", ...) call site
    for line in source.splitlines():
        line = line.strip()
        if line.startswith('"run_') and line.endswith('",'):
            worker_name = line.strip('",')
            assert hasattr(pipeline_worker, worker_name), (
                f"api/pipeline.py references pipeline_worker.{worker_name}, "
                f"which does not exist"
            )
