import os
from PIL import Image, ImageDraw

base_dir = r"C:\Users\mohda\.gemini\antigravity-ide\scratch\youtube-transcript-pro\icons"
os.makedirs(base_dir, exist_ok=True)

def create_icon(size):
    # Create image with RGBA
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    # Rounded background
    padding = max(1, size // 16)
    radius = size // 4
    
    # YouTube vibrant gradient simulation or clean branded red background
    bg_color = (235, 32, 38, 255) # YouTube signature vibrant red
    draw.rounded_rectangle([padding, padding, size - padding, size - padding], radius=radius, fill=bg_color)
    
    # Draw transcript document / lines in white
    scale = size / 128.0
    
    # White paper / transcript box
    doc_x0 = int(32 * scale)
    doc_y0 = int(24 * scale)
    doc_x1 = int(96 * scale)
    doc_y1 = int(104 * scale)
    doc_r = int(10 * scale)
    draw.rounded_rectangle([doc_x0, doc_y0, doc_x1, doc_y1], radius=max(2, doc_r), fill=(255, 255, 255, 255))
    
    # Inner transcript text lines
    line_color = (235, 32, 38, 255)
    accent_color = (70, 80, 95, 220)
    
    # Timestamp indicator dot/pill on line 1
    draw.rounded_rectangle([int(40 * scale), int(38 * scale), int(56 * scale), int(46 * scale)], radius=int(3 * scale), fill=line_color)
    draw.rounded_rectangle([int(62 * scale), int(39 * scale), int(88 * scale), int(45 * scale)], radius=int(2 * scale), fill=accent_color)
    
    # Line 2
    draw.rounded_rectangle([int(40 * scale), int(54 * scale), int(56 * scale), int(62 * scale)], radius=int(3 * scale), fill=line_color)
    draw.rounded_rectangle([int(62 * scale), int(55 * scale), int(88 * scale), int(61 * scale)], radius=int(2 * scale), fill=accent_color)

    # Line 3
    draw.rounded_rectangle([int(40 * scale), int(70 * scale), int(56 * scale), int(78 * scale)], radius=int(3 * scale), fill=line_color)
    draw.rounded_rectangle([int(62 * scale), int(71 * scale), int(84 * scale), int(77 * scale)], radius=int(2 * scale), fill=accent_color)
    
    # Bottom subtle play icon badge
    badge_x0 = int(68 * scale)
    badge_y0 = int(76 * scale)
    badge_x1 = int(106 * scale)
    badge_y1 = int(114 * scale)
    draw.ellipse([badge_x0, badge_y0, badge_x1, badge_y1], fill=(20, 20, 25, 255))
    
    # Small play triangle in badge
    t_p1 = (badge_x0 + int(14 * scale), badge_y0 + int(10 * scale))
    t_p2 = (badge_x0 + int(14 * scale), badge_y0 + int(28 * scale))
    t_p3 = (badge_x0 + int(28 * scale), badge_y0 + int(19 * scale))
    draw.polygon([t_p1, t_p2, t_p3], fill=(255, 215, 0, 255)) # Gold play arrow
    
    out_path = os.path.join(base_dir, f"icon-{size}.png")
    img.save(out_path, "PNG")
    print(f"Generated {out_path} ({size}x{size})")

for s in [16, 48, 128]:
    create_icon(s)
print("All icons successfully generated!")
