from __future__ import annotations

import pytest

from tests.support import RecordingPublisher, certificate_api


@pytest.fixture
def publisher() -> RecordingPublisher:
    return RecordingPublisher()


@pytest.fixture
def api(publisher):
    with certificate_api(event_publisher=publisher) as context:
        yield context
