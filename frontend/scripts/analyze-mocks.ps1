$files = Get-ChildItem "$PSScriptRoot\..\public\mocks\*.html"
$domains = @{}
$brands = @{}
$mojibake = @()
$ids = @{}
$brandPatterns = 'IELTS\s?OS|ieltsos|@[a-zA-Z0-9_]{4,}|t\.me|telegram|instagram|youtube|learning\s?cent|academy|school|edu\s?cent|mock\s?by|prepared\s?by|created\s?by|made\s?by|copyright|©|all rights'

foreach ($f in $files) {
  $c = Get-Content $f.FullName -Raw -Encoding UTF8
  foreach ($x in [regex]::Matches($c, 'https?://[a-zA-Z0-9\.\-_]+')) {
    $d = $x.Value -replace '^https?://',''
    if (-not $domains.ContainsKey($d)) { $domains[$d] = [System.Collections.Generic.HashSet[string]]::new() }
    [void]$domains[$d].Add($f.Name)
  }
  foreach ($x in [regex]::Matches($c, $brandPatterns, 'IgnoreCase')) {
    $k = $x.Value.ToLower()
    if (-not $brands.ContainsKey($k)) { $brands[$k] = [System.Collections.Generic.HashSet[string]]::new() }
    [void]$brands[$k].Add($f.Name)
  }
  if ($c -match 'вЂ|Ã©|Ã¢|â€') { $mojibake += $f.Name }
  foreach ($x in [regex]::Matches($c, 'id="(result-modal|result-details|score-summary|resultModal|results|score|result)"')) {
    $k = $x.Groups[1].Value
    if (-not $ids.ContainsKey($k)) { $ids[$k] = [System.Collections.Generic.HashSet[string]]::new() }
    [void]$ids[$k].Add($f.Name)
  }
}

"=== DOMAINS ==="
$domains.GetEnumerator() | Sort-Object Name | ForEach-Object { "{0,-40} {1,3} files" -f $_.Name, $_.Value.Count }
""
"=== BRAND / CREDIT PATTERNS ==="
$brands.GetEnumerator() | Sort-Object Name | ForEach-Object { "{0,-30} {1,3} files: {2}" -f $_.Name, $_.Value.Count, (($_.Value | Sort-Object | Select-Object -First 8) -join ',') }
""
"=== MOJIBAKE (encoding) files: $($mojibake.Count) ==="
($mojibake | Sort-Object) -join ', '
""
"=== RESULT IDS ==="
$ids.GetEnumerator() | Sort-Object Name | ForEach-Object { "{0,-20} {1,3} files" -f $_.Name, $_.Value.Count }
