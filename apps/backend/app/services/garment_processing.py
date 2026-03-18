from __future__ import annotations

from app.services.image_utils import bytes_buffer


def remove_background(image_bytes: bytes) -> tuple[bytes, int, int]:
    try:
        from PIL import Image
    except ImportError as exc:
        raise RuntimeError("Garment processing requires pillow to be installed.") from exc

    image = Image.open(bytes_buffer(image_bytes)).convert("RGBA")
    pixels = image.load()
    width, height = image.size

    background = sample_background(image)

    for y in range(height):
        for x in range(width):
            red, green, blue, alpha = pixels[x, y]
            distance = color_distance((red, green, blue), background)
            brightness = (red + green + blue) / 3

            if distance < 26 or (distance < 42 and brightness > 210):
                pixels[x, y] = (red, green, blue, 0)
            elif distance < 62:
                next_alpha = round(((distance - 26) / 36) * alpha)
                pixels[x, y] = (red, green, blue, max(0, min(255, next_alpha)))

    output = bytes_buffer(b"")
    image.save(output, format="PNG")
    return output.getvalue(), width, height


def sample_background(image):
    width, height = image.size
    sample_points = [
        (0, 0),
        (width - 1, 0),
        (0, height - 1),
        (width - 1, height - 1),
        (width // 2, 0),
        (width // 2, height - 1),
    ]
    pixels = image.load()
    red = green = blue = 0

    for x, y in sample_points:
        pixel = pixels[x, y]
        red += pixel[0]
        green += pixel[1]
        blue += pixel[2]

    count = len(sample_points)
    return (round(red / count), round(green / count), round(blue / count))


def color_distance(color_a, color_b) -> float:
    dr = color_a[0] - color_b[0]
    dg = color_a[1] - color_b[1]
    db = color_a[2] - color_b[2]
    return (dr * dr + dg * dg + db * db) ** 0.5
