from fastapi import Depends, FastAPI, Request
from fastapi.testclient import TestClient
from starlette.middleware.sessions import SessionMiddleware

from app.auth import current_user


def make_app() -> FastAPI:
    app = FastAPI()
    app.add_middleware(SessionMiddleware, secret_key="test-secret")

    @app.get("/whoami")
    def whoami(user_id: int = Depends(current_user)):
        return {"user_id": user_id}

    @app.post("/fake-login")
    def fake_login(request: Request):
        request.session["user_id"] = 42
        return {"ok": True}

    return app


def test_current_user_returns_401_when_no_session():
    with TestClient(make_app()) as client:
        r = client.get("/whoami")
        assert r.status_code == 401


def test_current_user_returns_user_id_when_logged_in():
    with TestClient(make_app()) as client:
        client.post("/fake-login")
        r = client.get("/whoami")
        assert r.status_code == 200
        assert r.json() == {"user_id": 42}
