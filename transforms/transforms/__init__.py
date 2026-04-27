"""Transform classes auto-discovered by maltego-trx.

New transforms must be imported here so register_transform_classes can find them.
"""

from .misp_event_pivot import MispEventPivot  # noqa: F401
