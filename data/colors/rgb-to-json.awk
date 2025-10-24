BEGIN {
	print "["
}

NR > 1 {
	comma = ",\n"
}
{
	r = sprintf("%02x", $2)
	g = sprintf("%02x", $3)
	b = sprintf("%02x", $4)
	hex = sprintf("#%s%s%s", r, g, b)
	printf "%s  { \"index\": %d, \"r\": %d, \"g\": %d, \"b\": %d, \"hex\": \"%s\" }",
        comma, $1, $2, $3, $4, sprintf("#%02x%02x%02x", $2, $3, $4)
}

END {
	print "\n]"
}
