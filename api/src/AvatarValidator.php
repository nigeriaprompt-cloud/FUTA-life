<?php
declare(strict_types=1);
/**
 * AvatarValidator — the server-side twin of FutaAvatar.look.normalize() (avatar-build.js).
 * NEVER trust a look sent by a browser: run it through clean() before saving.
 * Source of truth for allowed values: public/world/game/avatar/avatar-options.json  (same file the JS uses).
 * Returns a cleaned look array; never throws for bad fields (it clamps / drops them) so old clients keep working.
 */
final class AvatarValidator
{
    private array $o;

    public function __construct(?string $optionsPath = null)
    {
        $optionsPath ??= __DIR__ . '/../../public/world/game/avatar/avatar-options.json';
        $this->o = json_decode((string)file_get_contents($optionsPath), true, 512, JSON_THROW_ON_ERROR);
    }

    /** @param bool $allowRestricted true only for server-made NPC looks (uniforms, hi-vis, lab coat…) */
    public function clean(mixed $in, bool $allowRestricted = false): array
    {
        $in = is_array($in) ? $in : [];
        $b = is_array($in['body'] ?? null) ? $in['body'] : [];
        $f = is_array($in['face'] ?? null) ? $in['face'] : [];
        $h = is_array($in['hair'] ?? null) ? $in['hair'] : [];
        $w = is_array($in['wear'] ?? null) ? $in['wear'] : [];
        $P = $this->o['palettes'];
        $frame = ($b['frame'] ?? 'm') === 'f' ? 'f' : 'm';

        $out = ['v' => 1];
        $out['body'] = [
            'frame' => $frame,
            'height' => $this->num($b['height'] ?? 1, 0.92, 1.08, 1.0),
            'build' => $this->num($b['build'] ?? .5, 0, 1, .5),
            'bust' => $this->num($b['bust'] ?? .5, 0, 1, .5),
            'hips' => $this->num($b['hips'] ?? .5, 0, 1, .5),
            'shoulders' => $this->num($b['shoulders'] ?? .5, 0, 1, .5),
        ];
        $out['skin'] = $this->int($in['skin'] ?? 5, 0, count($P['skin']) - 1, 5);
        $F = $this->o['face'];
        $out['face'] = [
            'shape' => $this->int($f['shape'] ?? 0, 0, $F['shape']['count'] - 1, 0),
            'eyes' => $this->int($f['eyes'] ?? 0, 0, $F['eyes']['count'] - 1, 0),
            'eyeColor' => $this->int($f['eyeColor'] ?? 0, 0, $F['eyeColor']['count'] - 1, 0),
            'brows' => $this->int($f['brows'] ?? 0, 0, $F['brows']['count'] - 1, 0),
            'nose' => $this->int($f['nose'] ?? 0, 0, $F['nose']['count'] - 1, 0),
            'lips' => $this->int($f['lips'] ?? 0, 0, $F['lips']['count'] - 1, 0),
        ];
        $styles = array_column($this->o['hair']['styles'], 'id');
        $style = in_array($h['style'] ?? null, $styles, true) ? $h['style'] : ($frame === 'f' ? 'cornrows' : 'fade');
        $out['hair'] = ['style' => $style, 'color' => $this->int($h['color'] ?? 0, 0, count($P['hair']) - 1, 0), 'seed' => $this->int($h['seed'] ?? 7, 0, 99999, 7)];
        $beards = array_column($this->o['beard']['styles'], 'id');
        $out['beard'] = ($frame === 'm' && in_array($in['beard'] ?? 'none', $beards, true)) ? $in['beard'] : 'none';

        $mk = is_array($in['makeup'] ?? null) ? $in['makeup'] : [];
        $out['makeup'] = [];
        if (isset($mk['lips'])) $out['makeup']['lips'] = $this->int($mk['lips'], 0, count($P['lip']) - 1, 0);
        if (isset($mk['shadow'])) $out['makeup']['shadow'] = $this->int($mk['shadow'], 0, count($P['shadow']) - 1, 0);
        if (isset($mk['blush'])) $out['makeup']['blush'] = $this->int($mk['blush'], 0, count($P['blush']) - 1, 0);
        if (!empty($mk['liner'])) $out['makeup']['liner'] = true;
        if (!empty($mk['lashes'])) $out['makeup']['lashes'] = true;
        if (isset($in['nails'])) $out['nails'] = $this->int($in['nails'], 0, count($P['nail']) - 1, 0);

        $out['wear'] = [];
        $defaults = $this->o['defaults'][$frame];
        foreach (array_keys($this->o['wear']) as $slot) {
            $it = $this->item($slot, $w[$slot] ?? null, $allowRestricted);
            if ($it === null && isset($defaults[$slot])) $it = $defaults[$slot];
            if ($it !== null && $it['id'] !== 'none') $out['wear'][$slot] = $it;
        }
        if (isset($out['wear']['dress'])) { unset($out['wear']['top'], $out['wear']['bottom']); } // a dress replaces top + bottom
        $out['makeup'] = (object)$out['makeup']; // keep {} (not []) in JSON
        return $out;
    }

    private function item(string $slot, mixed $raw, bool $allowRestricted): ?array
    {
        if (!is_array($raw) || !isset($raw['id'])) return null;
        $def = null;
        foreach ($this->o['wear'][$slot] as $d) if ($d['id'] === $raw['id']) { $def = $d; break; }
        if ($def === null) return null;
        if (!empty($def['restricted']) && !$allowRestricted) return null;
        $n = count($this->o['palettes']['cloth']);
        $it = ['id' => $def['id'], 'c' => $this->int($raw['c'] ?? 0, 0, $n - 1, 0)];
        if (isset($raw['c2'])) $it['c2'] = $this->int($raw['c2'], 0, $n - 1, 0);
        if (!empty($def['pat']) && isset($raw['p']) && in_array($raw['p'], $this->o['patterns'], true)) $it['p'] = $raw['p'];
        return $it;
    }

    private function int(mixed $v, int $lo, int $hi, int $d): int { return is_numeric($v) ? max($lo, min($hi, (int)round((float)$v))) : $d; }
    private function num(mixed $v, float $lo, float $hi, float $d): float { return is_numeric($v) ? round(max($lo, min($hi, (float)$v)), 3) : $d; }
}
