import pytest
from fastapi.testclient import TestClient

from app.main import STATIC_DIR, app

client = TestClient(app)


def test_health_returns_ok():
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


@pytest.mark.skipif(
    not (STATIC_DIR / "index.html").exists(),
    reason="frontend not built (static/index.html missing)",
)
def test_root_serves_frontend_index():
    response = client.get("/")
    assert response.status_code == 200
    assert "Kanban Studio" in response.text
