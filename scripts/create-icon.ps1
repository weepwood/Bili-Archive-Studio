Add-Type -AssemblyName System.Drawing
$bmp = New-Object System.Drawing.Bitmap(512,512)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.Clear([System.Drawing.Color]::FromArgb(0,174,236))
$white = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
$f = New-Object System.Drawing.Font("Arial",130,[System.Drawing.FontStyle]::Bold)
$g.DrawString("B", $f, $white, 167, 145)
$bmp.Save((Join-Path (Get-Location) "icon.png"),[System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose()
$f.Dispose()
$white.Dispose()
$bmp.Dispose()
Write-Output "icon.png generated"
