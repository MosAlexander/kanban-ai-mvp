def test_unauthenticated_session_check(client):
    r = client.get("/api/session")
    assert r.status_code == 200
    assert r.json() == {"authenticated": False}


def test_login_with_wrong_credentials_returns_401(client):
    r = client.post(
        "/api/session",
        json={"username": "wrong", "password": "wrong"},
    )
    assert r.status_code == 401


def test_login_with_correct_credentials_sets_cookie(client):
    r = client.post(
        "/api/session",
        json={"username": "пользователь", "password": "пароль"},
    )
    assert r.status_code == 200
    assert r.json() == {"authenticated": True}
    assert any("session=" in c for c in r.headers.get_list("set-cookie"))


def test_session_check_after_login(client):
    client.post(
        "/api/session",
        json={"username": "пользователь", "password": "пароль"},
    )
    r = client.get("/api/session")
    assert r.status_code == 200
    assert r.json() == {"authenticated": True}


def test_logout_clears_session(client):
    client.post(
        "/api/session",
        json={"username": "пользователь", "password": "пароль"},
    )
    assert client.get("/api/session").json() == {"authenticated": True}
    r = client.delete("/api/session")
    assert r.status_code == 204
    assert client.get("/api/session").json() == {"authenticated": False}
