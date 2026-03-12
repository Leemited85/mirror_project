from __future__ import annotations

from abc import ABC, abstractmethod

from app.models.schemas import FittingRequest, OverlayBox


class FittingEngine(ABC):
    @abstractmethod
    def compute_overlay(self, request: FittingRequest) -> OverlayBox:
        """Return an overlay box for the requested garment and frame."""

    @property
    @abstractmethod
    def name(self) -> str:
        """Engine identifier for observability."""
