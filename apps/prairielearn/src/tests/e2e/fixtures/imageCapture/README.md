`large.heic` is a generated 2400 × 1200 solid blue image used to exercise real
browser HEIC decoding and the element's 2000-pixel submission limit. It contains
no personal photos or metadata. Generate it with Pillow and pillow-heif in a
temporary environment (neither is an additional application dependency):

```python
from PIL import Image
import pillow_heif

pillow_heif.register_heif_opener()
Image.new("RGB", (2400, 1200), (30, 100, 200)).save("large.heic", format="HEIF")
```
