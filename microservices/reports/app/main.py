from __future__ import annotations

import uvicorn

from .config import Settings
from .factory import create_app

app = create_app()


if __name__ == "__main__":
    settings = Settings.from_env()
    uvicorn.run(app, host="0.0.0.0", port=settings.port)
