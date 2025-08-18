#!/usr/bin/env ruby

require 'json'
require 'csv'
require 'rgeo'

class GridGenerator
  def initialize(city, cell_size = 200.0)
    @city = city
    @outline_file = "data/src/#{city}/outline.geojson"
    @airbnb_file = "data/src/#{city}/listings.csv"
    @cell_size = cell_size.to_f

    # Use Cartesian factory for spatial operations but keep WGS84 coordinates
    @factory = RGeo::Cartesian.preferred_factory(srid: 4326)

    # For Lisbon area, approximate degrees per meter
    # At latitude ~38.7°, 1 degree longitude ≈ 88,000 meters
    # At any latitude, 1 degree latitude ≈ 111,000 meters
    @lat = 38.7  # Approximate latitude of Lisbon
    @meters_per_degree_lat = 111000.0
    @meters_per_degree_lon = 111000.0 * Math.cos(@lat * Math::PI / 180.0)
  end

  def meters_to_degrees_lat(meters)
    meters / @meters_per_degree_lat
  end

  def meters_to_degrees_lon(meters)
    meters / @meters_per_degree_lon
  end

  def load_city_outline
    puts "Loading #{@city} outline..."

    begin
      file_content = File.read(@outline_file)
      geojson = JSON.parse(file_content)

      # Parse GeoJSON to extract coordinates
      if geojson['type'] == 'FeatureCollection'
        geometry_data = geojson['features'][0]['geometry']
      elsif geojson['geometry']
        geometry_data = geojson['geometry']
      else
        geometry_data = geojson
      end

      # Extract coordinate arrays
      coordinates = geometry_data['coordinates']

      # Handle MultiPolygon vs Polygon
      if geometry_data['type'] == 'MultiPolygon'
        # Take the first (largest) polygon
        polygon_coords = coordinates[0][0]
      elsif geometry_data['type'] == 'Polygon'
        polygon_coords = coordinates[0]
      else
        raise "Unsupported geometry type: #{geometry_data['type']}"
      end

      # Create points in WGS84
      points = polygon_coords.map do |coord|
        lon, lat = coord[0], coord[1]
        @factory.point(lon, lat)
      end

      # Create polygon
      outline_polygon = @factory.polygon(@factory.linear_ring(points))

      puts "Loaded #{@city} outline"
      outline_polygon
    rescue => e
      puts "Error loading #{@city} outline: #{e.message}"
      puts e.backtrace.first(5)
      exit 1
    end
  end

  def load_airbnb_data
    puts "Loading Airbnb listings..."

    listings = []

    begin
      CSV.foreach(@airbnb_file, headers: true) do |row|
        # Clean price data
        price_str = row['price'].to_s.gsub(/[$,]/, '')
        price = price_str.to_f

        lat = row['latitude'].to_f
        lon = row['longitude'].to_f

        # Skip invalid data
        next if price <= 0 || lat == 0 || lon == 0

        # Create point in WGS84
        point = @factory.point(lon, lat)

        listings << {
          price: price,
          point: point,
          lat: lat,
          lon: lon
        }
      end

      puts "Loaded #{listings.length} valid Airbnb listings"
      listings
    rescue => e
      puts "Error loading Airbnb data: #{e.message}"
      puts e.backtrace.first(5)
      exit 1
    end
  end

  def create_grid(outline_geometry)
    puts "Creating #{@cell_size.to_i}m x #{@cell_size.to_i}m grid..."

    # Manually calculate bounding box from outline geometry
    coords = []
    ring = outline_geometry.exterior_ring
    (0...ring.num_points).each do |i|
      point = ring.point_n(i)
      coords << [point.x, point.y]
    end

    xs = coords.map { |c| c[0] }
    ys = coords.map { |c| c[1] }

    min_lon = xs.min
    min_lat = ys.min
    max_lon = xs.max
    max_lat = ys.max

    puts "WGS84 Bounds: #{min_lon.round(6)}, #{min_lat.round(6)}, #{max_lon.round(6)}, #{max_lat.round(6)}"

    # Convert cell size from meters to degrees
    cell_size_lat = meters_to_degrees_lat(@cell_size)
    cell_size_lon = meters_to_degrees_lon(@cell_size)

    # Calculate number of cells
    cols = ((max_lon - min_lon) / cell_size_lon).ceil
    rows = ((max_lat - min_lat) / cell_size_lat).ceil

    puts "Grid will be #{cols} x #{rows} = #{cols * rows} cells"
    puts "Cell size in degrees: #{cell_size_lon.round(8)} lon, #{cell_size_lat.round(8)} lat"

    grid_cells = []
    cell_id = 1

    (0...rows).each do |row|
      (0...cols).each do |col|
        # Calculate cell bounds in degrees
        left = min_lon + col * cell_size_lon
        bottom = min_lat + row * cell_size_lat
        right = left + cell_size_lon
        top = bottom + cell_size_lat

        # Create rectangle polygon
        points = [
          @factory.point(left, top),
          @factory.point(right, top),
          @factory.point(right, bottom),
          @factory.point(left, bottom),
          @factory.point(left, top)
        ]

        cell_polygon = @factory.polygon(@factory.linear_ring(points))

        # Check if cell intersects with city outline
        if outline_geometry.intersects?(cell_polygon)
          grid_cells << {
            id: cell_id,
            polygon: cell_polygon,
            left: left,
            top: top,
            right: right,
            bottom: bottom,
            row: row,
            col: col
          }
        end

        cell_id += 1
      end
    end

    puts "Created #{grid_cells.length} grid cells that intersect with #{@city}"
    grid_cells
  end

  def calculate_price_stats(prices)
    return [nil, nil, nil, 0] if prices.empty?

    valid_prices = prices.select { |p| p > 0 }
    return [nil, nil, nil, 0] if valid_prices.empty?

    [
      valid_prices.min,
      valid_prices.max,
      valid_prices.sum.to_f / valid_prices.length,
      valid_prices.length
    ]
  end

  def process_grid(grid_cells, airbnb_listings)
    puts "Calculating price statistics for each cell..."

    features = []

    grid_cells.each_with_index do |cell, i|
      if i % 50 == 0
        puts "Processing cell #{i + 1}/#{grid_cells.length}"
      end

      # Find listings within this cell
      prices_in_cell = []

      airbnb_listings.each do |listing|
        if cell[:polygon].contains?(listing[:point])
          prices_in_cell << listing[:price]
        end
      end

      # Calculate statistics
      price_min, price_max, price_mean, num_points = calculate_price_stats(prices_in_cell)

      # Only include cells with data
      if num_points > 0
        properties = {
          'id' => cell[:id],
          'left' => cell[:left],
          'top' => cell[:top],
          'right' => cell[:right],
          'bottom' => cell[:bottom],
          'price_min' => price_min.round(2),
          'price_max' => price_max.round(2),
          'price_mean' => price_mean.round(2),
          'listings_count' => num_points.to_f
        }

        # Convert polygon to coordinate array for GeoJSON (already in WGS84)
        exterior_ring = cell[:polygon].exterior_ring
        coordinates = []
        (0...exterior_ring.num_points).each do |i|
          point = exterior_ring.point_n(i)
          coordinates << [point.x, point.y]
        end

        feature = {
          'type' => 'Feature',
          'properties' => properties,
          'geometry' => {
            'type' => 'Polygon',
            'coordinates' => [coordinates]
          }
        }

        features << feature
      end
    end

    puts "Generated #{features.length} grid cells with Airbnb data"
    features
  end

  def generate
    # Load data
    outline = load_city_outline
    airbnb_listings = load_airbnb_data

    # Create grid
    grid_cells = create_grid(outline)

    # Process grid and calculate statistics
    features = process_grid(grid_cells, airbnb_listings)

    # Create GeoJSON output
    geojson_output = {
      'type' => 'FeatureCollection',
      'name' => "#{@city}_#{@cell_size.to_i}",
      'crs' => {
        'type' => 'name',
        'properties' => {
          'name' => 'urn:ogc:def:crs:EPSG::4326'
        }
      },
      'features' => features
    }

    # Save to file
    output_file = "data/#{@city}_#{@cell_size.to_i}.geojson"
    puts "Saving to #{output_file}..."

    File.write(output_file, JSON.pretty_generate(geojson_output))

    puts "Successfully created #{output_file} with #{features.length} grid cells"

    # Print statistics
    if features.any?
      all_prices = features.map { |f| f['properties']['price_mean'] }
      all_counts = features.map { |f| f['properties']['listings_count'] }

      puts "\nStatistics:"
      puts "Price range: €#{all_prices.min} - €#{all_prices.max}"
      puts "Average price: €#{(all_prices.sum / all_prices.length).round(2)}"
      puts "Total listings: #{all_counts.sum}"
      puts "Average listings per cell: #{(all_counts.sum / all_counts.length).round(1)}"
    end
  end
end

def print_usage
  puts "Usage: ruby generate_grid.rb <city_name> [cell_size_in_meters]"
  puts "Examples:"
  puts "  ruby generate_grid.rb lisboa           # Uses default 200m cells for Lisboa"
  puts "  ruby generate_grid.rb lisboa 100       # Uses 100m cells for Lisboa"
  puts "  ruby generate_grid.rb porto 500        # Uses 500m cells for Porto"
  puts ""
  puts "Requires: data/src/<city>/outline.geojson and data/src/<city>/listings.csv"
end

# Main execution
if __FILE__ == $0
  # Parse command line arguments
  if ARGV.include?('-h') || ARGV.include?('--help') || ARGV.length < 1
    print_usage
    exit 0
  end

  city = ARGV[0]
  cell_size = 200.0  # default

  if ARGV.length > 1
    begin
      cell_size = ARGV[1].to_f
      if cell_size <= 0
        puts "Error: Cell size must be a positive number"
        print_usage
        exit 1
      end
    rescue
      puts "Error: Invalid cell size '#{ARGV[1]}'"
      print_usage
      exit 1
    end
  end

  # Check if files exist
  outline_file = "data/src/#{city}/outline.geojson"
  airbnb_file = "data/src/#{city}/listings.csv"

  unless File.exist?(outline_file)
    puts "Error: #{outline_file} not found!"
    exit 1
  end

  unless File.exist?(airbnb_file)
    puts "Error: #{airbnb_file} not found!"
    exit 1
  end

  puts "Using city: #{city}"
  puts "Using cell size: #{cell_size.to_i}m x #{cell_size.to_i}m"
  puts ""

  # Generate the grid
  generator = GridGenerator.new(city, cell_size)
  generator.generate
end
