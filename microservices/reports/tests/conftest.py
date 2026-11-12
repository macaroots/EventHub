from __future__ import annotations

import pytest

from app.infrastructure.database import ReportsRepository
from tests.support import reports_api, seed


@pytest.fixture
def repository() -> ReportsRepository:
    repo = ReportsRepository(":memory:")
    try:
        yield repo
    finally:
        repo.close()


@pytest.fixture
def seeded(repository: ReportsRepository) -> ReportsRepository:
    return seed(repository)


@pytest.fixture
def api():
    with reports_api() as context:
        yield context
