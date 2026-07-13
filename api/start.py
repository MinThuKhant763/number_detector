"""Production entrypoint for the FastAPI backend."""

from __future__ import annotations

from os import getenv

import uvicorn


def main() -> None:
    """Start the API using cloud-provider friendly environment variables."""

    uvicorn.run(
        "api.main:app",
        host=getenv("HOST", "0.0.0.0"),
        port=int(getenv("PORT", "3001")),
        proxy_headers=True,
        forwarded_allow_ips=getenv("FORWARDED_ALLOW_IPS", "*"),
    )


if __name__ == "__main__":
    main()
